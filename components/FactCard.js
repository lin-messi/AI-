"use client";

import { useState } from "react";
import { useApp } from "./AppProvider";
import { STRINGS } from "@/lib/i18n";

export default function FactCard({ facts }) {
  const { lang } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];
  const [idx, setIdx] = useState(0);

  const fact = facts[idx];
  const next = () => {
    let n = idx;
    if (facts.length > 1) {
      while (n === idx) n = Math.floor(Math.random() * facts.length);
    }
    setIdx(n);
  };

  const text = lang === "en" ? fact.en : fact.zh;
  const alt = lang === "both" ? fact.en : null;

  return (
    <div className="fact">
      <div className="bulb">💡</div>
      <div className="fact-body">
        <div className="fact-label">{t.factLabel}</div>
        <div className="fact-text">
          {text}
          {alt && <span className="alt">{alt}</span>}
        </div>
      </div>
      <button className="btn" onClick={next}>
        🎲 {t.nextFact}
      </button>
    </div>
  );
}
