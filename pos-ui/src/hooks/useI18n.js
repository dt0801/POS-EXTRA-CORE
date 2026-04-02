import { useCallback, useEffect, useState } from "react";
import { LANGUAGE_STORAGE_KEY, MESSAGES } from "../i18n/messages";

export default function useI18n() {
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return saved === "de" ? "de" : "vi";
  });

  const t = useCallback((key) => MESSAGES[key]?.[language] || MESSAGES[key]?.vi || key, [language]);
  const tPair = useCallback((vi, de) => (language === "de" ? de : vi), [language]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => (prev === "vi" ? "de" : "vi"));
  }, []);

  return { language, setLanguage, toggleLanguage, t, tPair };
}
