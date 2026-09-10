import { deadline, ensureOk } from "./upstream";
import { env } from "cloudflare:workers";
import { cached } from "./cache";
import { site } from "./site";

/**
 * GitHub data. Everything here returns empty/null rather than throwing when
 * the token is missing, so the site still renders on a fresh clone with no
 * secrets configured.
 */

const GITHUB_API = "https://api.github.com";

function headers() {
  const token = env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "rcn.sh",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function username() {
  return env.GITHUB_USERNAME || site.githubUser;
}

// --- Contribution calendar ---

export type ContributionDay = {
  date: string;
  count: number;
  /** 0–4, matching GitHub's own NONE→FOURTH_QUARTILE buckets. */
  level: number;
};

export type Contributions = {
  total: number;
  weeks: ContributionDay[][];
};

const LEVELS: Record<string, number> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

const CONTRIBUTIONS_QUERY = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays { date contributionCount contributionLevel }
          }
        }
      }
    }
  }
`;

export async function getContributions(): Promise<Contributions | null> {
  // The contribution calendar is only exposed over GraphQL, which always
  // requires a token — unlike the REST endpoints below.
  if (!env.GITHUB_TOKEN) return null;

  return cached(
    `github:contributions:${username()}`,
    60 * 60,
    async () => {
      const response = await fetch(`${GITHUB_API}/graphql`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({
          query: CONTRIBUTIONS_QUERY,
          variables: { login: username() },
        }),
        signal: deadline(),
      });

      ensureOk(response, "GitHub GraphQL");

      const json = (await response.json()) as {
          data?: {
            user?: {
              contributionsCollection?: {
                contributionCalendar?: {
                  totalContributions: number;
                  weeks: {
                    contributionDays: {
                      date: string;
                      contributionCount: number;
                      contributionLevel: string;
                    }[];
                  }[];
                };
              };
            };
          };
        };

      const calendar =
        json.data?.user?.contributionsCollection?.contributionCalendar;
      // A 200 with no calendar in it is a malformed answer, not an empty one —
      // throwing keeps the last good copy rather than caching the absence.
      if (!calendar) throw new Error("GitHub GraphQL returned no contribution calendar");

      return {
        total: calendar.totalContributions,
        weeks: calendar.weeks.map((week) =>
          week.contributionDays.map((day) => ({
            date: day.date,
            count: day.contributionCount,
            level: LEVELS[day.contributionLevel] ?? 0,
          })),
        ),
      };
    },
    // The calendar is anchored to today's date, so a month-old copy would
    // render with a blank strip at the right-hand edge. Past a day, wait.
    { maxStaleSeconds: 60 * 60 * 24 },
  );
}

// --- Repositories ---

export type Repo = {
  name: string;
  description: string | null;
  url: string;
  stars: number;
  language: string | null;
  updatedAt: string;
};

export async function getRepos(): Promise<Repo[]> {
  return cached(`github:repos:${username()}`, 60 * 30, async () => {
    const response = await fetch(
      `${GITHUB_API}/users/${username()}/repos?per_page=100&sort=updated`,
      { headers: headers(), signal: deadline() },
    );
    ensureOk(response, "GitHub repos");

    const repos = (await response.json()) as {
      name: string;
      description: string | null;
      html_url: string;
      stargazers_count: number;
      language: string | null;
      updated_at: string;
      fork: boolean;
      archived: boolean;
    }[];

    return repos
      .filter((repo) => !repo.fork && !repo.archived)
      .map((repo) => ({
        name: repo.name,
        description: repo.description,
        url: repo.html_url,
        stars: repo.stargazers_count,
        language: repo.language,
        updatedAt: repo.updated_at,
      }));
  });
}

/** Repos in `pinned` order, then the most recently updated, up to `limit`. */
export async function getFeaturedRepos(
  pinned: readonly string[],
  limit = 6,
): Promise<Repo[]> {
  const repos = await getRepos();
  const byName = new Map(repos.map((repo) => [repo.name.toLowerCase(), repo]));

  const featured: Repo[] = [];
  for (const name of pinned) {
    const repo = byName.get(name.toLowerCase());
    if (repo) {
      featured.push(repo);
      byName.delete(name.toLowerCase());
    }
  }

  for (const repo of repos) {
    if (featured.length >= limit) break;
    if (byName.has(repo.name.toLowerCase())) featured.push(repo);
  }

  return featured.slice(0, limit);
}

export type Profile = {
  followers: number;
  publicRepos: number;
  createdAt: string;
};

export async function getProfile(): Promise<Profile | null> {
  return cached(`github:profile:${username()}`, 60 * 60, async () => {
    const response = await fetch(`${GITHUB_API}/users/${username()}`, {
      headers: headers(),
      signal: deadline(),
    });
    ensureOk(response, "GitHub profile");

    const user = (await response.json()) as {
      followers: number;
      public_repos: number;
      created_at: string;
    };

    return {
      followers: user.followers,
      publicRepos: user.public_repos,
      createdAt: user.created_at,
    };
  });
}
