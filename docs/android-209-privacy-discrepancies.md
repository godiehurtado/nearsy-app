# Android 2.0.9: privacy policy discrepancies

The published policy does not match what this client does on the points below. They are recorded here
for the policy owner. **The web policy has not been changed.**

- **Policy:** https://nearsy.app/privacy-policy, "Last updated: October 27, 2026", read on 2026-11-03.
- **Client:** integration branch of #120. Quotes are the policy's exact words.

## Direct contradictions

| Policy section | Policy says | This client does |
|---|---|---|
| 1.5 Contact Matching | "transformed into secure one-way SHA-256 hashes directly on the user’s device" | Hashes nothing on the device. Phone numbers and emails leave it as they are, over TLS, and Nearsy Identity normalizes and HMAC-hashes them (`contactsHmac/contactsBook.android.ts`, `contactsSync.consentBody` in `i18n/resources/settings.ts`) |
| 1.5 Contact Matching | "Only these hashed identifiers are transmitted securely" | Same: the identifiers themselves are transmitted to Identity |
| 1.2 Location Information | "collects approximate location ONLY when visibility is ON" | Requests `ACCESS_FINE_LOCATION`, samples with `Accuracy.Highest` and sends coordinates unrounded (`app.json`, `visibility/orchestration.ts`, `visibility/callables/requests.ts`). The Visibility condition holds; "approximate" does not |

The in-app Contacts disclosure describes the real behavior, so the app and its policy tell the user two
different things.

## Scope narrower than the disclosure

| Policy section | Policy says | In-app disclosure says |
|---|---|---|
| 1.2 and 1.4 | "while the app is minimized" | "even when the app is closed or not in use" (`backgroundVisibility` in `i18n/resources/settings.ts`) |

The policy never covers a closed app.

## Inside the policy

| Section | Text | Problem |
|---|---|---|
| 1.2 | "does not share location data with third parties" | Absolute |
| 1.4 | "except service providers strictly necessary to operate the app" | Allows what 1.2 rules out |

## Destination stated in the policy

Section 1.5 names "our backend service (Firebase Firestore)" as where hashes go. The client sends identifiers
to Nearsy Identity. Where Identity stores its results is outside this repository and was not checked.

## Not verified

- **Backend behavior,** which this client cannot show:
  - Section 1.2, "Store your location history": what the server keeps or coarsens.
  - Section 1.5, "stored contact hashes are deleted from our servers": the client asks Identity to disable and purges its sources; the server-side deletion was not checked here.
- **Google Play Data Safety and the Play location declaration:** not consulted, so **neither has been reviewed** against this behavior or this policy.

## Changed in the app for this

- Welcome, Login and Register now open the policy. Welcome and Login only named it before, and Register did not mention it.
- Spanish disclosure and notification copy says "Visibilidad".

The substance of the consent text did not change.
