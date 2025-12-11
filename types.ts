// FIX: Replaced Firebase v9 'User' type import with v8 compatible 'firebase.User'.
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';

export interface Client {
  id: string;
  name: string;
}

export interface Campaign {
  id: string;
  clientId: string;
  name: string;
  description: string;
  publishStart: string;
  publishEnd: string;
  submissionStart: string;
  submissionEnd:string;
  deliveryType: 'interval' | 'datetime';
  deliveryIntervalDays?: number;
  deliveryDateTime?: string;
  deliveryChannel?: 'email' | 'line';
  lineChannelId?: string;
  lineChannelSecret?: string;
  lineMessage?: string;
  emailTemplate?: {
    subject: string;
    body: string;
  };
  settings: {
    form: FormSettings;
    survey: SurveySettings;
    design: DesignSettings;
    content: ContentSettings;
  };
}

export interface FormSettings {
  fields: {
    message: FieldSetting;
    image: FieldSetting;
    email: FieldSetting;
    customFields: CustomFieldSetting[];
  };
  fromEmail: string;
}

export interface FieldSetting {
  enabled: boolean;
  required: boolean;
  label: string;
}

export interface CustomFieldSetting extends FieldSetting {
  id: string;
  type: 'text' | 'textarea' | 'select';
  options?: string[];
}

export interface SurveySettings {
  enabled: boolean;
  questions: SurveyQuestion[];
}

export interface SurveyQuestion {
  id:string;
  text: string;
  type: 'text' | 'textarea' | 'radio' | 'checkbox' | 'select';
  options?: string[];
  required: boolean;
}

export interface DesignSettings {
  mainVisualUrl: string;
  themeColor: string;
  backgroundColor: string;
  backgroundImageUrl: string;
  showTitle?: boolean;
}

export interface HowToSettings {
  type: 'steps' | 'free';
  steps: { id: string; title: string; text: string; imageUrl: string; }[];
  freeText: { text: string; imageUrl: string; };
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface Host {
  id: string;
  name: string;
  url: string;
}

export interface ContentSettings {
  showHowTo: boolean;
  howTo: HowToSettings;
  showFaq: boolean;
  faq: FaqItem[];
  showHosts: boolean;
  hosts: Host[];
  terms: string;
  privacy: string;
  footer: {
    textLinks: { text: string; url: string }[];
    showBanners: boolean;
    bannerLinks: { id: string; imageUrl: string; targetUrl: string; }[];
    copyright: string;
  };
}

export interface Submission {
  id: string;
  campaignId: string;
  submittedAt: string;
  deliveryChoice: 'email' | 'line';
  lineUserId?: string;
  delivered?: boolean;
  deliveredAt?: string; // Scheduled delivery time (set when submission is created, shows when email should be sent)
  formData: {
    message?: string;
    imageUrl?: string;
    email?: string;
    [customFieldId: string]: any;
  };
  surveyAnswers: {
    [questionId: string]: any;
  };
}

export type Action =
  // FIX: Use firebase.User for v8 compatibility.
  | { type: 'SET_USER'; payload: firebase.User | null };

export interface AppState {
  isLoading: boolean;
  isAuthenticated: boolean;
  // FIX: Use firebase.User for v8 compatibility.
  user: firebase.User | null;
}