---
title: Planned systems and known gaps
description: Things we still need to work on and why.
---

# Planned systems and known gaps

This page keeps track of things we'd like to fix or support later. These aren't implemented yet.

## Miscellaneous fixes

### Running the local web app against staging

#### Context

Right now, you can run the web app with a local API and database, or use the deployed staging web app. The mobile app can also run on your computer or device while connecting directly to the staging API.

Sometimes we might want to work on the web frontend locally while using staging's API and test data. That would let us check frontend changes against the deployed backend without setting up a local database or deploying every frontend change first.

#### Problem

Our current setup doesn't support that combination just by changing the API URL in `apps/web/.env.local`.

The local web app and staging API are different sites. Browser sign-in depends on secure session cookies, trusted origins, and the deployed web auth proxy. Changing the API address alone doesn't configure those pieces, so it isn't a supported way to sign in to staging from the local frontend.

For now, use the full local stack for local web development, or open the deployed staging web app. See [Accessing staging](/docs/development/environments#accessing-staging) for the supported options.

#### Future work

Work out whether we want to support this as a development workflow. If we do, choose and review an approach for browser authentication, proxy routing, and allowed origins before adding configuration or setup commands.

The setup should make it clear that the local frontend is using shared staging data. It must keep backend secrets out of the browser and preserve staging's authentication protections, rather than disabling cookie checks or allowing arbitrary origins.

Before calling it supported, check sign-in, session restoration, authenticated API requests, and sign-out from the local frontend against staging. Then document the exact env files and commands needed.

## Context features

### Weather on posts

#### Context

Mobile can add a weather snapshot (condition, temperature, and place name) to a post, shown on post detail only. The phone fetches it from Open-Meteo and the API validates its shape and range. See [Daily posts and release timing](/docs/systems/daily-posts-and-release-timing#a-weather-snapshot-rides-along).

#### Problem

- Open-Meteo's free tier is for non-commercial use and asks for attribution. A commercial launch needs a paid plan or a different provider.
- The server cannot verify a snapshot, because it never sees the provider's answer. It is the author's own report.
- The feature has been checked only by automated tests and an Android debug build. It has not been run on an emulator or on any physical device, and the iOS build and the real iOS permission prompt have not been checked at all.
- A snapshot cannot be added, changed, or removed after posting, and the web composer has no weather section.
- The place name comes from the phone's geocoder, so its language and detail can differ between devices, and a device without a geocoder always falls back to choosing a place.
- Music context, the other half of the original ticket, is not built. Android needs notification-listener access to read other apps' playback, iOS exposes only Apple Music, and Spotify needs OAuth credentials an administrator would provision.

#### Future work

Decide the weather provider before any commercial release, and record the decision in the product decisions. Check the iOS prompt, the Settings recovery path, and reduced-accuracy location on a physical iPhone, and a physical Android phone with location off.

Decide whether an author may remove a snapshot after posting. Adding or changing one would need revision handling, because the revision history does not yet cover it. Plan music separately, with manual title and artist entry as the dependable path and Apple Music as an optional iOS source.
