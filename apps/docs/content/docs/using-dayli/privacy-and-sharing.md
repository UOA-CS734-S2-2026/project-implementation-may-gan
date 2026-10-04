---
title: Privacy and sharing
description: Understand post audiences, profile visibility, messages, and planned share links.
---

# Privacy and sharing

Each dayli has an audience. Your profile also has a visibility setting. Both affect who can read a released Friends post.

## Choose an audience for every dayli

The composer requires you to choose an audience before posting:

- **Friends:** Only you can read the post until the next Auckland midnight. After release, active friends can read it. If your profile is public, other visitors can also read it through your profile or a direct post link, including when signed out. A signed-in account you have blocked cannot read it.
- **Solo:** Only you can read the post, before and after release.

There is no default selection. The friends feed remains limited to active friends; making your profile public does not put your posts in other people's feeds.

Your own archive marks a Solo post **Only you**. It marks a Friends post **Not released yet** until release time.

![Dayli mobile audience picker before Friends or Solo has been selected](/images/using-dayli/privacy-mobile-audience-unselected.webp)

<!-- Screenshot ID: UD-PS-01 -->

On the web, a public profile and its released Friends posts can be opened at `/u/{username}` and `/u/{username}/{postId}` without signing in. The mobile app also accepts signed-out profile and post routes. Dayli does not provide separate revocable share links yet; a public post link stays readable while the post and profile remain public.

## Set profile visibility

Open **Settings** on the web. On mobile, tap the profile circle at the top and open **settings**. Use **Private profile** to choose who can read your profile and released Friends posts:

- With a private profile, active friends can see your bio and streak and read released Friends posts. Other unblocked visitors see only your username.
- With a public profile, unblocked visitors can see your public name, bio, avatar, streak, and released Friends posts. This includes signed-out visitors.

Changing the setting also affects Friends posts you released earlier. Switching to public opens them to other visitors. Switching back to private removes that access on subsequent requests. Solo and unreleased posts remain visible only to you.

![Dayli web Settings page with profile editing fields](/images/using-dayli/privacy-web-profile-visibility.webp)

<!-- Screenshot ID: UD-PS-02 -->

## Friends and changing access

Removing a friend ends their friend access immediately. They can still read released Friends posts if your profile is public. Removing a friend cannot erase a post or message they already saw, copied, downloaded, or captured.

Dayli has backend support for blocked relationships, but there is no block control in the current web or mobile interface. A block denies access to the blocked account while it is signed in. Content on a public profile remains available to signed-out visitors.

## Messages are a different sharing channel

Messages have their own inbox and request rules. A nonfriend can send one initial message request, while friends can begin an active conversation. Accepting a message request does not make the sender your friend.

Messages are not end-to-end encrypted. Dayli's authorized backend can read stored content to deliver and manage conversations. Use **Unsend** when it is available if you want to remove a sent message from the conversation, but remember that unsending cannot recall a message somebody has already seen or saved.

## Notes to tomorrow's you

A note to tomorrow is stored privately with your dayli and is not part of the Friends post audience. Dayli does not yet have a reading screen for these notes. Reading them from the next day is planned.
