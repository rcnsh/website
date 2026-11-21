# 0210. The repos widget tells a failure from an empty list

`getFeaturedRepos` throws on failure instead of returning `[]`, so the repos island in `src/components/widgets/Repos.astro` can show "Couldn't reach GitHub" for a thrown error and "Nothing to show yet" for an empty list, and a failure is never cached as empty.

Repo rows use three columns only from `lg` (1024px); between `md` and `lg` the meta sits under the description, because below 1024px a third column squeezes the description to five or more lines. The skeleton's description is about 100 characters of transparent sample text, the length of a typical repo description, so the skeleton wraps to the same number of lines as a loaded row at every width.
