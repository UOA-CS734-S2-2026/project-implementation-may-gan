---
title: Help and troubleshooting
description: Fix common sign-in, posting, upload, feed, and access problems.
---

# Help and troubleshooting

Start with the message Dayli shows you. The sections below explain the most common ones and what to do next.

## I cannot create an account

For **Use 3-30 lowercase letters, numbers, or underscores.**, enter a username such as `alex_lee`. Do not use spaces, uppercase letters, hyphens, or other punctuation.

For **Password must be at least 8 characters.**, choose a longer password.

If the email already belongs to an account, return to sign in instead of creating another account.

## I forgot my password

On the web sign-in page, choose **Forgot password?**, enter your email, then choose **Send reset link**.

Dayli always responds with **If that address has an account, a reset link is on its way.** Check the inbox and spam folder for that address. The link expires after 15 minutes.

If you see **This reset link is invalid, expired, or could not be used.**, request a new link and use the newest email.

On mobile, open the web version of the same Dayli environment in a browser and complete the reset there. Staging and local development have separate accounts. There is no production environment yet. The environment must also have reset email delivery configured. If it does not, the reset screen can accept the request without an email being delivered.

> **Screenshot placeholder `UD-HT-01`:** Web forgot-password screen after a safe test address has been submitted, showing the neutral confirmation message.

## Google sign-in does not work

Google access depends on the deployment or mobile build. **Google sign-in isn't set up for this build yet.** means that build has no working Google configuration. Use email and password, or ask the person who supplied the build which sign-in methods it supports.

If Google belongs to an existing Dayli account but is not connected yet, sign in with that account's password. Open **Settings**, choose **Connect Google**, and enter the current password when asked.

## My post will not submit

**You seem to be offline. Try again when you're connected. It won't be posted twice.** Reconnect, keep the composer open, and post again.

**Today's posting window closed at midnight, so this dayli can't be posted.** The server did not accept it before Auckland midnight. You cannot backdate it. On mobile, your saved words remain available to read or copy.

**Today's dayli was already posted, so this one can't be posted. Your words are still saved on this device.** Open **my days** to find today's post. Copy anything you need from the mobile draft before discarding it.

A post only counts when the server accepts it. Writing offline or leaving the composer open before midnight does not reserve a post.

> **Screenshot placeholder `UD-HT-02`:** Mobile composer showing the closed posting window state with safe sample draft text still available.

## Mobile media will not post

**Your photos and videos are still uploading. Post again once they're done.** Wait for every upload to finish, then choose **Post** again.

Check that you selected either up to 3 photos or 1 video, not a mixture. A video must be 15 seconds or shorter. Each file must be 10 MB or smaller, with a 25 MB total limit.

Media upload also has to be configured for the app build and environment. If it is not configured, use a build where uploads are enabled or submit the post without media.

On the web, the picker does not upload media. Selected files stay on your device, and the post is submitted without them.

## A dayli is missing from the feed

The feed shows yesterday's released Friends posts from current friends. Check these points:

- The author chose **Friends**, not **Solo**.
- The next Auckland midnight has passed.
- You and the author are still active friends.
- You are looking in **daylies** for friend posts, or **my days** for your own posts.

Older released friend posts may still be available from that friend's profile.

For **This dayli isn't available. It may have been deleted, or you may no longer have access.**, refresh once. If the message remains, the post is not available to the signed-in account.

## I cannot act on a mobile friend request from a profile

Open **friends**, then select **Requests**. Use **Accept** or **Decline** under **Received**, or **Cancel** under **Sent**. A mobile profile can show the pending state without putting the action there.

## My draft disappeared

Persistent drafts are a mobile feature. Mobile stores the current draft in protected storage on that device, but signing out removes the unsent draft. A draft that cannot be unlocked on the device is also removed.

The web composer does not persist drafts across a refresh, closed tab, or navigation away from the page.
