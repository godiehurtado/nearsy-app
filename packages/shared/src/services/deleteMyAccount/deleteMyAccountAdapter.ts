import {
  DeleteMyAccountError,
  isDeleteMyAccountError,
  type DeleteMyAccountSuccess,
} from './contract';
import {
  invokeDeleteMyAccountHttp,
  type InvokeDeleteMyAccountHttpInput,
} from './deleteMyAccountCallableHttp';
import type { DeleteMyAccountPort } from './port';

export type DeleteMyAccountAdapterDeps = {
  getCurrentUser: () => { uid: string; getIdToken: () => Promise<string> } | null;
  /** Runs `fn` with one App Check token; must not retry `fn`. */
  withAppCheckToken: <T>(fn: (appCheckToken: string) => Promise<T>) => Promise<T>;
  projectId: string;
  region?: string;
  emulatorHost?: string;
  emulatorPort?: number;
  invoke?: (input: InvokeDeleteMyAccountHttpInput) => Promise<DeleteMyAccountSuccess>;
};

export function createDeleteMyAccountAdapter(
  deps: DeleteMyAccountAdapterDeps,
): DeleteMyAccountPort {
  const invoke = deps.invoke ?? ((input) => invokeDeleteMyAccountHttp(input));
  return {
    async deleteMyAccount({ expectedUid }) {
      const user = deps.getCurrentUser();
      if (!user) throw new DeleteMyAccountError('UNAUTHENTICATED', false);
      if (user.uid !== expectedUid) {
        throw new DeleteMyAccountError('IDENTITY_CHANGED', false);
      }

      let idToken: string;
      try {
        idToken = await user.getIdToken();
      } catch {
        throw new DeleteMyAccountError('UNAUTHENTICATED', false);
      }
      if (deps.getCurrentUser()?.uid !== expectedUid) {
        throw new DeleteMyAccountError('IDENTITY_CHANGED', false);
      }

      let requestSent = false;
      try {
        return await deps.withAppCheckToken((appCheckToken) => {
          requestSent = true;
          return invoke({
            projectId: deps.projectId,
            region: deps.region,
            emulatorHost: deps.emulatorHost,
            emulatorPort: deps.emulatorPort,
            idToken,
            appCheckToken,
          });
        });
      } catch (err) {
        if (isDeleteMyAccountError(err)) throw err;
        // App Check token acquisition failed before any request left the device.
        if (!requestSent) throw new DeleteMyAccountError('APP_CHECK', false);
        throw new DeleteMyAccountError('UNKNOWN', true);
      }
    },
  };
}
