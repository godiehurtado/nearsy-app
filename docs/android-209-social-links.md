# Android 2.0.9 social links: CRJ and editor

Scope: PR #117, Android client. Product reference: iOS #116, used as behavior only; its
commits are not part of this history. No device QA yet.

## Behavior

Facebook, LinkedIn and Website are links the user saves, not verified accounts. They use one
card, modal and hook (`ManualSocialLinkCard`, `ManualSocialLinkModal`, `useManualSocialLinks`)
in the CRJ and in the editor, in Personal and Professional, EN and ES.

| State | Status | Action on the right | Also |
|---|---|---|---|
| No link | No link saved / Sin enlace | Connect / Conectar (blue, white text): opens the modal | |
| Saved | Link saved / Enlace guardado | Disconnect / Desconectar (red border and text): withdraws the link | Edit / Editar: opens the modal |

All seven networks use the same button text and pill, in the CRJ and the editor. The visible text
has no network name; the accessibility labels do.

Manual links have no green dot or badge. Order: YouTube → TikTok → Instagram → X → Facebook →
LinkedIn → Website. The YouTube, TikTok, Instagram and X cards changed in presentation only: their
OAuth, ownership, permission and transient states are the same.

The CRJ no longer offers Other network. Historical custom links are not shown or counted
there, and stay stored.

## Persistence

Add, edit and remove are written when they happen, without Next, Skip or Back. Each write
carries one key of one mode's bag:

- Other links, custom links, the other mode and lifecycle fields are not in the payload.
- **Remove uses the Firestore delete sentinel.** Writes are merges, and a merge keeps a key that
  is merely left out, so the earlier payload could not remove a link at all. The emulator
  check shows both behaviors.
- **CRJ Next and Skip no longer send custom links.** The old save rewrote the list, dropping any
  row that fails today's validation.
- Next and Skip wait for a link write in progress; otherwise their full bag could restore a link
  that is being removed.
- A result that arrives after the screen closed, or after the account or mode changed, is
  ignored. The write itself still reaches the server.

This replaces `onImmediatePersist`, whose caller discarded the new value and saved the previous
one.

## Editor bottom button

Back / Volver replaces the save button, in every state. It only calls `navigation.goBack()`, and
returns to the profile that opened the editor. The editor no longer has a save path or
unsaved-changes prompt, because it has no drafts left.

## Open points

- **Reference:** the Owner's image was not available to this work. The structure and sizes follow
  the request and the iOS card code at #116. Visual parity with iOS is unverified.
- **No native capture:** it needs a dev build, which was out of scope, and that build would
  talk to production Firebase.
- **Older unused helpers** (`validatePostCrjSocialDraftForSave` and related) remain exported and
  tested in `postCrjSocialEditor.ts`.
- **Device QA:** both screens in EN/ES and both modes; add, edit and remove followed by reopening;
  Back during a save; TalkBack and large text.
