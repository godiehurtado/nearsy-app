export type RootStackParamList = {
  ThemeSelection: undefined;
  Welcome: undefined;
  IntroVideo: undefined;
  Login: undefined;
  Register: undefined;
  ProfileCompletion:
    | {
        uid: string;
        email?: string | null;
        inputNonce?: number;
      }
    | undefined;
  CompleteProfile:
    | {
        uid: string;
        email?: string | null;
        inputNonce?: number;
      }
    | undefined;
  MainTabs: undefined;
  PhoneVerification: {
    uid: string;
    phone: string;
    from?: string;
  };

  Interests: any;
  Gallery: any;
  Affiliations: any;
  SocialMedia: any;
};
