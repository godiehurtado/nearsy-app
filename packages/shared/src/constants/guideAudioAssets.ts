export const GUIDE_AUDIO = {
  completeProfile: {
    step1: require('../assets/audio/CompleteProfile_Step1.mp3'),
    step2: require('../assets/audio/CompleteProfile_Step2.mp3'),
    step3: require('../assets/audio/CompleteProfile_Step3.mp3'),
    step4: require('../assets/audio/CompleteProfile_Step4.mp3'),
    step5: require('../assets/audio/CompleteProfile_Step5.mp3'),
    step6: require('../assets/audio/CompleteProfile_Step6.mp3'),
    step7: require('../assets/audio/CompleteProfile_Step7.mp3'),
    step8: require('../assets/audio/CompleteProfile_Step8.mp3'),
    tabAffiliations: require('../assets/audio/CompleteProfile_TabAffiliations.mp3'),
    tabInterests: require('../assets/audio/CompleteProfile_TabInterests.mp3'),
    goToSocialMedia: require('../assets/audio/CompleteProfile_GoToSocialMedia.mp3'),
    step10: require('../assets/audio/CompleteProfile_Step10.mp3'),
  },
  affiliations: {
    selectSchool: require('../assets/audio/Affiliations_EnterCollegeOrSchool.mp3'),
    enterName: require('../assets/audio/Affiliations_TypeYourSchoolName.mp3'),
    optionalImage: require('../assets/audio/Affiliations_IfDesiredAddAnImage.mp3'),
    tapSave: require('../assets/audio/Affiliations_TapToSave.mp3'),
    finalMessage: require('../assets/audio/Affiliations_FollowTheSameProcess.mp3'),
  },
  interests: {
    selectInterests: require('../assets/audio/Interests_SelectYourInterests.mp3'),
    tapDone: require('../assets/audio/Interests_TapDone.mp3'),
    save: require('../assets/audio/Interests_Save.mp3'),
  },
  social: {
    linkedin: require('../assets/audio/Linkedin.mp3'),
    instagram: require('../assets/audio/Instagram.mp3'),
    facebook: require('../assets/audio/Facebook.mp3'),
    youtube: require('../assets/audio/youtube.mp3'),
    twitter: require('../assets/audio/X.mp3'),
    tiktok: require('../assets/audio/TikTok.mp3'),
    snapchat: require('../assets/audio/Snapchat.mp3'),
    website: require('../assets/audio/Website.mp3'),
  },
} as const;

export type GuideAudioSource = number;
