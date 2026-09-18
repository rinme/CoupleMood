export type Language = 'th' | 'en';

export interface TranslationSchema {
  common: {
    loading: string;
    save: string;
    cancel: string;
    edit: string;
    delete: string;
    reset: string;
    close: string;
    back: string;
    copied: string;
    copy: string;
    connecting: string;
  };
  header: {
    appName: string;
    liveSync: string;
    connecting: string;
    copied: string;
    copyCodeTooltip: string;
    settingsTitle: string;
    settingsDesc: string;
    yourNickname: string;
    you: string;
    partner: string;
    notJoinedYet: string;
    coupleCode: string;
    liveStatus: string;
    connected: string;
    offline: string;
    unpairDesc: string;
    unpairButton: string;
    unpairing: string;
    language: string;
  };
  pairing: {
    title: string;
    tagline: string;
    coupleCodeLabel: string;
    generateRandom: string;
    codePlaceholder: string;
    codeHelp: string;
    nicknameLabel: string;
    nicknamePlaceholder: string;
    nicknameHelp: string;
    enterRoom: string;
    entering: string;
    errorEmptyCode: string;
    errorEmptyNickname: string;
    errorRoomFull: string;
    errorDefault: string;
    errorNetwork: string;
  };
  partnerCard: {
    waitingTitle: string;
    waitingDesc: string;
    copy: string;
    copied: string;
    partnerMood: string;
    quietForNow: string;
    waitingFor: string;
    notPostedYet: string;
    currentMoodSuffix: string;
    recent: string;
  };
  myMoodCard: {
    badge: string;
    title: string;
    clearStatus: string;
    clearing: string;
    noteLabel: string;
    notePlaceholder: string;
    broadcastButton: string;
    broadcasting: string;
    sentSuccess: string;
    manage: string;
  };
  manageModal: {
    title: string;
    subtitle: string;
    addPreset: string;
    editPreset: string;
    resetDefaults: string;
    resetConfirm: string;
    emojiLabel: string;
    labelLabel: string;
    labelPlaceholder: string;
    themeLabel: string;
    saveChanges: string;
    saving: string;
    cancel: string;
    delete: string;
    minLimitAlert: string;
    maxLimitAlert: string;
  };
  pushPrompt: {
    title: string;
    desc: string;
    enable: string;
    enabling: string;
    notNow: string;
    dismissAria: string;
  };
  toasts: {
    moodUpdated: string;
    moodCleared: string;
    defaultPartnerName: string;
  };
  footer: {
    craftedWith: string;
    forCouples: string;
  };
}
