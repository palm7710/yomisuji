'use client';

import { useEffect, useState } from 'react';

// 診断中に表示する「ページをめくる猫」。
// 文言は実際の処理の進み具合とは連動しない目安で、最後の段階まで進んだらそこで止まる。

const MESSAGES = [
  'ねこが、選んだ本を集めています',
  'ねこが、1冊ずつページをめくっています',
  'ねこが、あなたの読み筋を計算しています',
  'ねこが、説明文を書いています',
  'ねこが、おすすめの本を探しています',
];

const TIPS = [
  '同じ本を選んでも、診断するたびに少し違う結果になることがあります。いろいろな読み筋を楽しんでください。',
  '選んだ本のジャンルがばらばらでも大丈夫。ジャンルを越えた共通点を探します。',
  '結果は X に投稿したり、リンクで友だちに送ったりできます。',
  'おすすめの本は、Google Books で実在を確かめてから表示します。',
];

const STEP_MS = 4500;
const TIP_MS = 6000;

export function ReadingCat() {
  const [step, setStep] = useState(0);
  const [tip, setTip] = useState(0);

  useEffect(() => {
    const s = setInterval(() => setStep((n) => Math.min(MESSAGES.length - 1, n + 1)), STEP_MS);
    const t = setInterval(() => setTip((n) => (n + 1) % TIPS.length), TIP_MS);
    return () => {
      clearInterval(s);
      clearInterval(t);
    };
  }, []);

  return (
    <div className="overlay reading-cat" role="status" aria-live="polite">
      <span className="small muted" style={{ letterSpacing: '0.2em' }}>
        診断しています
      </span>
      <CatSvg />
      <p className="serif rc-message">
        {MESSAGES[step]}
        <span className="rc-dots" aria-hidden="true">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </p>
      <div className="rc-steps" aria-hidden="true">
        {MESSAGES.map((_, i) => (
          <span key={i} className={i === step ? 'now' : i < step ? 'done' : ''} />
        ))}
      </div>
      <span className="small muted">20〜40秒ほどかかります。このままお待ちください</span>
      <div className="rc-tip">
        <span className="rc-tip-label">待っているあいだに</span>
        <span>{TIPS[tip]}</span>
      </div>
    </div>
  );
}

function CatSvg() {
  return (
    <svg className="rc-cat" width="260" height="260" viewBox="0 0 260 260" role="img" aria-label="猫が本を読んでいるイラスト">
      <ellipse cx="130" cy="246" rx="96" ry="8" fill="#1E1C19" opacity="0.08" />
      <g className="rc-tail">
        <path d="M186 214 C236 214 242 160 214 148" fill="none" stroke="#C97B3E" strokeWidth="15" strokeLinecap="round" />
      </g>
      <ellipse cx="130" cy="192" rx="64" ry="52" fill="#D98F4E" />
      <ellipse cx="130" cy="202" rx="36" ry="34" fill="#F4DCBC" />
      <g className="rc-head">
        <polygon points="90,92 94,50 124,74" fill="#D98F4E" />
        <polygon points="98,84 100,62 116,76" fill="#F2B8A0" />
        <g className="rc-ear">
          <polygon points="170,92 166,50 136,74" fill="#D98F4E" />
          <polygon points="162,84 160,62 144,76" fill="#F2B8A0" />
        </g>
        <circle cx="130" cy="112" r="47" fill="#D98F4E" />
        <path d="M121 72 L123 86 M130 70 L130 86 M139 72 L137 86" stroke="#B8703A" strokeWidth="3.5" strokeLinecap="round" />
        <ellipse cx="130" cy="130" rx="19" ry="13" fill="#F4DCBC" />
        <g className="rc-eyes">
          <g className="rc-blink">
            <ellipse cx="113" cy="113" rx="5.5" ry="6.5" fill="#1E1C19" />
            <ellipse cx="147" cy="113" rx="5.5" ry="6.5" fill="#1E1C19" />
            <circle cx="115" cy="110.5" r="1.8" fill="#FFFDF8" />
            <circle cx="149" cy="110.5" r="1.8" fill="#FFFDF8" />
          </g>
        </g>
        <path d="M126 124 L134 124 L130 129 Z" fill="#C45A4A" />
        <path d="M130 129 Q126 135 121 133 M130 129 Q134 135 139 133" stroke="#3A3630" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M104 128 L86 124 M104 133 L86 135 M156 128 L174 124 M156 133 L174 135" stroke="#B8703A" strokeWidth="1.4" strokeLinecap="round" />
      </g>
      <rect x="62" y="166" width="136" height="72" rx="5" fill="#2E4A73" />
      <path d="M68 170 Q100 160 130 172 L130 234 Q100 224 68 232 Z" fill="#FFFDF8" stroke="#D8CFBE" />
      <path d="M192 170 Q160 160 130 172 L130 234 Q160 224 192 232 Z" fill="#FFFDF8" stroke="#D8CFBE" />
      <path d="M80 186 L118 188 M80 196 L118 198 M80 206 L112 207 M142 188 L180 186 M142 198 L180 196 M142 208 L172 206" stroke="#D8CFBE" strokeWidth="2.4" strokeLinecap="round" />
      <path className="rc-flip" d="M192 170 Q160 160 130 172 L130 234 Q160 224 192 232 Z" fill="#EFE6D3" stroke="#D8CFBE" />
      <ellipse cx="80" cy="216" rx="14" ry="10" fill="#D98F4E" />
      <ellipse cx="180" cy="216" rx="14" ry="10" fill="#D98F4E" />
    </svg>
  );
}
