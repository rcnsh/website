
---
title: "Building terminus"
description: "How I built a shuttle bus planner for NUS students on one Cloudflare Worker"
pubDate: 2026-10-10
---

I'm on exchange at NUS this year, and getting around campus without arriving at my lecture without being soaked in sweat means using internal shuttle buses. There are decent trackers for them already (bar the official uNivUS app) but the trouble is that a question that should take three seconds (which bus, from where, and when do I leave?) takes about six taps: open the app, find the stop, pick the right side of the road, read the table, then work out which service goes where you're going.

[terminus](https://terminus.run) answers that question for you. It reads your [NUSMods](https://nusmods.com) timetable, the live shuttle feed, the NUS academic calendar and the campus footpaths, then tells you which bus to catch, from which stop, and when to set off. If walking would get you there sooner, it says that too.

## One answer, four screens

terminus has a website that installs as a web app, an Android app with home screen widgets, and a Mac menu bar app. All of the thinking happens in a single Cloudflare Worker. A client asks for `/api/me/next` and gets back a finished card:

```json
// GET /api/me/next
{
  "label": "R2 · 6 min",
  "detail": "PGP · 5 min walk · GEA1000 @ UTown in ~16 min · crowding: medium · or D2 in 14 min",
  "quality": "live"
}
```

The full response has more fields (departure and arrival times, the stop, the walk), but no client works anything out from them. They draw the card and count the clock down. I set that rule early, because once one client starts formatting for itself, every bug comes in four slightly different versions. With four codebases in TypeScript, Kotlin and Swift, the only way I could keep them agreeing was to give them nothing to disagree about.

It also makes testing simpler. The API has a set of golden answers, whole responses pinned to JSON files for cases like "the last bus has gone", "your class falls on a public holiday" or "change at Kent Vale". The Android and Mac unit tests parse the same files, so a change to the answer's shape fails every client's tests at once.

## Reading the feed

There is no public API for the shuttles so I had to reverse engineer the API using [http-toolkit](https://httptoolkit.com/). This was probably the most fun I had during the entire process and has made me want to do more of this type of thing in the future. The official uNivUS app shows bus arrivals without a sign-in, using a guest token, and terminus reads the same endpoints. hewliyang's [nus-nextbus-web](https://github.com/hewliyang/nus-nextbus-web) was a useful reference I found, since its `.env.example` documents how the auth works. I based a lot of my reverse engineering work off this (so thank you!).

Some of what the api does:

- Errors come back as HTTP 200. An invalid key is `{"code":"10000","msg":"Invalid API KEY"}` with a 200 status line, so code that checks `res.ok` sails straight past it.
- Sending an `X-Forwarded-Proto` header makes the NUS load balancer answer 400 "Contradictory scheme headers" some of the time: two token requests in six when I compared them directly, and none in six without the header.
- Each request carries the uNivUS app's version string. When NUS ships a new app release, the old string gets refused with code `10009`, "We have a new release of uNivUS", and every answer would drop to "no data".

The version string is the one that needed the most care. When the Worker's 15-minute health check now sees a `10009`, it looks up the current version on Google Play and APKCombo, tries at most three candidates with NUS, saves the one that works to KV and emails me to say so. Nobody has to deploy anything.

Only `normalize()` in `src/fms.ts` touches the raw shape of the feed. It treats anything it can't read as missing rather than zero, so a blank arrival time becomes "no time" instead of "arriving now", and a reply NUS calls OK that can't be parsed counts as a failure instead of an empty stop.

## Which side of the road

The hardest bugs were about direction.

COM3 is the end of the line for D1 and D2, and the feed lists each of those services there twice, under two berth codes: `COM3-D2-S` for a run that starts at COM3 and `COM3-D2-E` for one that ends there. Both are the same physical stop. When no bus is waiting to leave, the arriving one comes first, so taking the earliest time hands you a bus that's about to finish its run. The normaliser marks the `-E` rows and the planner drops them.

The live map had a harder version of the same problem. Many routes use one road in both directions, and the two directions of the route line sit 0 to 12 metres apart, often on the very same points. GPS can't separate them, and a bus drawn on the wrong side shows a next stop kilometres round the route. On top of that, the feed only moves a bus every 15 to 20 seconds.

So each bus has a track: how far along the line it was last placed. A new position only counts if the bus could have driven there since, so it only ever moves forward and keeps to its side of the road. The tracks are stored in the edge cache next to the placed buses, so every Worker instance in a data centre gives the same answer. With readings that far apart, the map no longer tries to draw a bus where it is. It shows it at a stop, or halfway between the stop it passed and the next one, and slides it along the route when that changes.

## Being polite to NUS

terminus runs on top of someone else's servers, so it keeps strict limits. Arrivals are cached for 15 seconds per stop and live buses for 5 seconds per service, in Cloudflare's edge cache, which every Worker instance in a data centre shares. A 429, a 5xx, a refused key or a timeout opens a circuit breaker, and the Worker serves the last answer it has, marked as stale, instead of asking again. This means that terminus will make less requests to NUS servers than the equivalent number of users using the official uNivUS app!

There is one scheduled poller. A timelapse recorder saves every shuttle's position every 30 seconds through the day, so a whole day can be replayed on the map and exported as a video. It goes through the same cached path as the map, stops outside operating hours, backs off when NUS doesn't answer, and has a cap of 17,280 polls a day enforced in code. This was to give me some cool promotional material for the app. (also its pretty cool)

<video src="https://upload.rcn.sh/video/terminus-timelapse.mp4" poster="https://upload.rcn.sh/image/terminus-timelapse.jpg" controls muted playsinline preload="none"></video>


## English and Simplified Chinese

Let me preface this by saying, I don't speak Chinese. All of these translations have been assisted by AI and a quick look over by some of my friends who do speak it.

Every string a user reads exists in English and Simplified Chineseand the tests enforce it. The API's Chinese golden answers are checked word for word, the website's tests fail if English is written straight into a template, and Android lint fails on a missing translation. A glossary at the top of `src/i18n.ts` keeps the terms consistent (课 for class, 车站 for stop, 很挤 for packed), and place names like KR MRT and COM3 stay in English in both languages.

## The domain

terminus started out at `terminus.rcn.sh` and moved to `terminus.run` on 8 October. The next day I found that NUS Wi-Fi resets connections to the new domain, most likely because it's so new. Until that clears, the emails terminus sends link to `terminus.rcn.sh`, and the old address keeps working in full instead of redirecting. I like my `rcn.sh` domain too much to get rid of it so the api will hopefully never go down, even if it hurts to be paying £50 a year for it. :/

## Polish

Once the answers were right, I got a bit carried away with how terminus looks and feels.

The top of the Now tab is a sky that follows the clock. Dawn starts at 6:30, the day at 8:30, golden hour at 4:30 PM, dusk at 6:45 PM and night at 7:40 PM (Singapore's sunrise and sunset barely move over the year, so fixed hours work fine). It shows the time of day rather than the weather, so you get a low sun behind the hills at dawn and dusk, stars and a moon at night, and a little single-decker bus driving along the bottom.

The hills are meant to be Kent Ridge, roughly. When you scroll the moon and stars move at half speed and the far hills lag behind the near ones, and pulling down to refresh stretches the sky open and drives the bus back to its spot once the new answer comes in.

On the map, instead of jumping, a bus (coloured dot) slides along the route line to its new place, taking one to four seconds depending on how far it's going, so it's done before the next update five seconds later. Buses at a stop sit just beside the dot on the kerb side so you can still see the stop. If your device asks for reduced motion, buses just jump and the sky stays still.

Most of the rest is stuff you'd only notice if it was wrong. Countdowns round the same way on the website, Android and the Mac, nothing jumps around while the fonts and first card load, and the colours stay readable at every hour in light and dark mode. This is where a lot of the commits went: 439 of the 1,074 are fixes and little changes to give it that premium polish. :)


## What's next

I'm at NUS for about a year, so terminus has to be something another student can pick up after I leave. That's why the repo has a long `internals.md` that records the reasons behind each rule, from the cache times to the side-of-the-road tracking.

You can use it at [terminus.run](https://terminus.run), or [terminus.rcn.sh](https://terminus.rcn.sh) on campus Wi-Fi. The Android and Mac apps are on the download page, and the API is documented at [/docs](https://terminus.run/docs).
