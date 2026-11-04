# Android 2.0.9 social links: CRJ and editor

Scope: PR #117, Android client. Product reference: iOS #116, used as behavior only; its
commits are not part of this history. No device QA yet.

## Behavior

Facebook, LinkedIn and Website are links the user saves, not verified accounts. They use one
card, modal and hook (`ManualSocialLinkCard`, `ManualSocialLinkModal`, `useManualSocialLinks`)
in the CRJ and in the editor, in Personal and Professional, EN and ES.

| State | Status | Blue button | Remove |
|---|---|---|---|
| No link | No link saved / Sin enlace | Add link / Añadir enlace | No |
| Saved | Link saved / Enlace guardado | Edit / Editar | Remove / Quitar |

There is no green dot or badge. Order: YouTube → TikTok → Instagram → X → Facebook →
LinkedIn → Website. The YouTube, TikTok, Instagram and X cards are unchanged.

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

- **Header counter:** the editor header still says "N connections" and counts saved links, next to
  verified accounts. It claims no verification, and the requirement only named the bottom button.
- **Contrast in the ownership cards, not changed:** their button text uses `palette.surface`, which
  is dark on the blue button in the dark theme. The new cards and Back use white.
- **Older unused helpers** (`validatePostCrjSocialDraftForSave` and related) remain exported and
  tested in `postCrjSocialEditor.ts`.
- **Device QA:** both screens in EN/ES and both modes; add, edit and remove followed by reopening;
  Back during a save; TalkBack and large text.
