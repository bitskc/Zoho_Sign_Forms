
import { FormDefinition, AdminAuth } from '../types';

const KEYS = {
  FORMS: 'signflow_forms',
  ADMIN: 'signflow_admin'
};

export const storage = {
  getForms: (): FormDefinition[] => {
    const data = localStorage.getItem(KEYS.FORMS);
    return data ? JSON.parse(data) : [];
  },
  saveForms: (forms: FormDefinition[]) => {
    localStorage.setItem(KEYS.FORMS, JSON.stringify(forms));
  },
  getAdmin: (): AdminAuth => {
    const data = localStorage.getItem(KEYS.ADMIN);
    return data ? JSON.parse(data) : {
      username: 'admin',
      password: 'admin'
    };
  },
  saveAdmin: (admin: AdminAuth) => {
    localStorage.setItem(KEYS.ADMIN, JSON.stringify(admin));
  }
};
