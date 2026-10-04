# Using Dayli screenshot checklist

This is an internal capture and placement checklist for the visible placeholders in `apps/docs/content/docs/using-dayli`. It is outside the published documentation content.

## Capture rules

- Use dedicated test accounts in a non-production environment.
- Use names such as `Alex Lee`, usernames such as `alex_docs`, and `example.com` email addresses. Do not show real email addresses, messages, friend lists, tokens, or personal photos.
- Use the same viewport and theme within each platform set. Capture the full control named below, with enough surrounding UI to make its location clear.
- Crop browser chrome, emulator controls, system notifications, and device identifiers unless they explain the workflow.
- Confirm the environment supports the state before capture. A source implementation is not proof that a deployed site or app build has been configured.
- Save optimized images under `apps/docs/public/images/using-dayli/` with the filenames listed below.
- Replace only the matching blockquote placeholder. Keep each ID in this checklist after replacement so the image can be recaptured later.

## `UD-GS-01`

- **Target:** `apps/docs/content/docs/using-dayli/getting-started.md`, after the account field list.
- **Platform:** Web, desktop width.
- **Capture:** Open the sign-up screen. Show **Username**, **Public name (optional)**, **Email**, **Password**, and **Let's go** in one frame. Leave the password blank.
- **Safe data:** Username `alex_docs`, public name `Alex Lee`, email `alex.docs@example.com`.
- **Future path:** `apps/docs/public/images/using-dayli/getting-started-web-sign-up.webp`
- **Alt text:** `Dayli web sign-up form with username, public name, email, and password fields`
- **Replacement Markdown:** `![Dayli web sign-up form with username, public name, email, and password fields](/images/using-dayli/getting-started-web-sign-up.webp)`

## `UD-GS-02`

- **Target:** `apps/docs/content/docs/using-dayli/getting-started.md`, after the navigation explanation.
- **Platform:** Mobile app.
- **Capture:** Sign in with a test account and open **daylies**. Show the top profile circle and the complete bottom bar with **daylies**, **friends**, **new dayli**, **my days**, and **messages**. Use an empty or test-only feed.
- **Safe data:** Test account `alex_docs`, no personal profile photo, zero unread messages if possible.
- **Future path:** `apps/docs/public/images/using-dayli/getting-started-mobile-navigation.webp`
- **Alt text:** `Dayli mobile home screen with profile button and bottom navigation`
- **Replacement Markdown:** `![Dayli mobile home screen with profile button and bottom navigation](/images/using-dayli/getting-started-mobile-navigation.webp)`

## `UD-CDP-01`

- **Target:** `apps/docs/content/docs/using-dayli/creating-your-daily-post.md`, after the composer navigation instructions.
- **Platform:** Web, desktop width.
- **Capture:** Open **new dayli** on an account that has not posted for the current Auckland day. Show **Post your Dayli!**, today's test prompt, the untouched rating, empty answer fields, audience choices, and **Post**. Do not select media.
- **Safe data:** Use the configured test prompt. Leave all user-entered fields empty.
- **Future path:** `apps/docs/public/images/using-dayli/create-web-empty-composer.webp`
- **Alt text:** `Empty Dayli web composer showing today's prompt, rating, audience, and Post button`
- **Replacement Markdown:** `![Empty Dayli web composer showing today's prompt, rating, audience, and Post button](/images/using-dayli/create-web-empty-composer.webp)`

## `UD-CDP-02`

- **Target:** `apps/docs/content/docs/using-dayli/creating-your-daily-post.md`, after the mobile media limits.
- **Platform:** Mobile app build with media uploads configured.
- **Capture:** Open **new dayli**, select one synthetic photo, enter a short answer, choose a rating, and scroll so the selected media and **who can see this** area are understandable in the capture. Choose **Solo** if a selection is needed to fit the frame. Do not post.
- **Safe data:** A generated image of a plain colored desk, answer `A quiet day working on a small project.`, rating 7, no tomorrow note.
- **Future path:** `apps/docs/public/images/using-dayli/create-mobile-media-and-audience.webp`
- **Alt text:** `Dayli mobile composer with sample photo, reflection fields, and audience choice`
- **Replacement Markdown:** `![Dayli mobile composer with sample photo, reflection fields, and audience choice](/images/using-dayli/create-mobile-media-and-audience.webp)`

## `UD-FF-01`

- **Target:** `apps/docs/content/docs/using-dayli/friends-and-the-feed.md`, after the mobile username search steps.
- **Platform:** Mobile app.
- **Capture:** Open **friends** on the **Friends** tab. Show both **Friends** and **Requests**, the friend filter, and **Find people by username**. An empty list is acceptable.
- **Safe data:** Test account only. If a friend row is visible, use `Sam Test` with username `sam_docs`.
- **Future path:** `apps/docs/public/images/using-dayli/friends-mobile-tabs-and-discovery.webp`
- **Alt text:** `Dayli mobile friends screen with Friends and Requests tabs and username discovery`
- **Replacement Markdown:** `![Dayli mobile friends screen with Friends and Requests tabs and username discovery](/images/using-dayli/friends-mobile-tabs-and-discovery.webp)`

## `UD-FF-02`

- **Target:** `apps/docs/content/docs/using-dayli/friends-and-the-feed.md`, after the feed visibility list.
- **Platform:** Web, desktop width.
- **Capture:** Use test accounts with released Friends posts from the previous Auckland day. Open **daylies** and show two feed cards plus enough navigation to identify the page. Do not include personal media.
- **Safe data:** Authors `Sam Test` and `Jamie Test`. Use prompts and answers written only for documentation, such as `Finished a library book and made pasta.`
- **Future path:** `apps/docs/public/images/using-dayli/friends-web-released-feed.webp`
- **Alt text:** `Dayli web feed showing released posts from test friends`
- **Replacement Markdown:** `![Dayli web feed showing released posts from test friends](/images/using-dayli/friends-web-released-feed.webp)`

## `UD-PS-01`

- **Target:** `apps/docs/content/docs/using-dayli/privacy-and-sharing.md`, after the post audience explanation.
- **Platform:** Mobile app.
- **Capture:** Open **new dayli** for an account that has not posted today. Scroll to **who can see this** and capture the untouched state before either **Friends** or **Solo** has been selected.
- **Safe data:** Leave nearby text fields empty or use `A calm day.` if the answer appears in frame.
- **Future path:** `apps/docs/public/images/using-dayli/privacy-mobile-audience-unselected.webp`
- **Alt text:** `Dayli mobile audience picker before Friends or Solo has been selected`
- **Replacement Markdown:** `![Dayli mobile audience picker before Friends or Solo has been selected](/images/using-dayli/privacy-mobile-audience-unselected.webp)`

## `UD-PS-02`

- **Target:** `apps/docs/content/docs/using-dayli/privacy-and-sharing.md`, after the profile visibility choices.
- **Platform:** Web, desktop width.
- **Capture:** Open **Settings** for a test account. Frame the profile visibility control and the current sentence describing who can see the bio and streak. Avoid account email or connected-provider details if they contain real data.
- **Safe data:** Test account `alex_docs`, generic or empty bio.
- **Future path:** `apps/docs/public/images/using-dayli/privacy-web-profile-visibility.webp`
- **Alt text:** `Dayli web Settings page showing the profile visibility control`
- **Replacement Markdown:** `![Dayli web Settings page showing the profile visibility control](/images/using-dayli/privacy-web-profile-visibility.webp)`

## `UD-HT-01`

- **Target:** `apps/docs/content/docs/using-dayli/help-and-troubleshooting.md`, after the password reset instructions.
- **Platform:** Web, desktop width in a non-production environment with reset email delivery configured.
- **Capture:** From sign in, choose **Forgot password?**, submit the test account email, and capture **If that address has an account, a reset link is on its way.** Do not show an inbox, reset URL, or token.
- **Safe data:** `alex.docs@example.com`, backed by a disposable test mailbox if delivery must be checked.
- **Future path:** `apps/docs/public/images/using-dayli/help-web-reset-confirmation.webp`
- **Alt text:** `Dayli web password reset screen showing the neutral email confirmation`
- **Replacement Markdown:** `![Dayli web password reset screen showing the neutral email confirmation](/images/using-dayli/help-web-reset-confirmation.webp)`

## `UD-HT-02`

- **Target:** `apps/docs/content/docs/using-dayli/help-and-troubleshooting.md`, after the posting error explanations.
- **Platform:** Mobile app in an isolated test environment.
- **Capture:** Prepare a protected local draft, then use a controlled test environment where the server reports that the posting window has closed. Reopen the composer and capture **Today's posting window closed at midnight, so this dayli can't be posted.** with the retained words visible. Do not alter a device clock and present that as server behavior.
- **Safe data:** Answer `Documentation test draft.`, word dump `Safe text retained for this capture.`, no media or tomorrow note.
- **Future path:** `apps/docs/public/images/using-dayli/help-mobile-closed-draft.webp`
- **Alt text:** `Dayli mobile closed posting window with test draft words still available`
- **Replacement Markdown:** `![Dayli mobile closed posting window with test draft words still available](/images/using-dayli/help-mobile-closed-draft.webp)`
