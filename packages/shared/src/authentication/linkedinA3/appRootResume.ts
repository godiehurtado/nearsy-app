/**
 * App-root LinkedIn A3 resume: cold start (getInitialURL) + warm URL events.
 * Never calls Start. Unrelated URLs are skipped without clearing the register.
 */

import {
  resumeLinkedInA3FromReturnUrl,
  type LinkedInA3ResumeDeps,
  type LinkedInA3ResumeResult,
} from './durableResume';

export type LinkedInA3LinkingPort = {
  getInitialURL: () => Promise<string | null>;
  addEventListener: (
    type: 'url',
    handler: (event: { url: string }) => void,
  ) => { remove: () => void };
};

export type LinkedInA3AppRootResumeArgs = {
  linking: LinkedInA3LinkingPort;
  resumeDeps: LinkedInA3ResumeDeps;
  onResult: (result: LinkedInA3ResumeResult) => void | Promise<void>;
};

/**
 * Subscribe to launch + warm URLs. Caller must unsubscribe on unmount.
 */
export function attachLinkedInA3AppRootResume(
  args: LinkedInA3AppRootResumeArgs,
): () => void {
  let cancelled = false;
  const seen = new Set<string>();

  async function handleUrl(url: string | null): Promise<void> {
    if (cancelled || !url) return;
    if (seen.has(url)) return;
    seen.add(url);

    const result = await resumeLinkedInA3FromReturnUrl(url, args.resumeDeps);
    if (cancelled) return;
    await args.onResult(result);
  }

  void args.linking.getInitialURL().then((url) => {
    void handleUrl(url);
  });

  const subscription = args.linking.addEventListener('url', ({ url }) => {
    void handleUrl(url);
  });

  return () => {
    cancelled = true;
    subscription.remove();
  };
}
