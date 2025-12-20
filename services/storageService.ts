
import { FormDefinition, ZohoConfig } from '../types';

const KEYS = {
  FORMS: 'signflow_forms',
  CONFIG: 'signflow_config'
};

export const storage = {
  getForms: (): FormDefinition[] => {
    const data = localStorage.getItem(KEYS.FORMS);
    return data ? JSON.parse(data) : [];
  },
  saveForms: (forms: FormDefinition[]) => {
    localStorage.setItem(KEYS.FORMS, JSON.stringify(forms));
  },
  getConfig: (): ZohoConfig => {
    const data = localStorage.getItem(KEYS.CONFIG);
    return data ? JSON.parse(data) : {
      adminPassword: 'admin' // Default password
    };
  },
  saveConfig: (config: ZohoConfig) => {
    localStorage.setItem(KEYS.CONFIG, JSON.stringify(config));
  }
};
