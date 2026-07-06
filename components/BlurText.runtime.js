import React, { useMemo } from 'https://esm.sh/react@19';

function splitSegments(text, animateBy) {
  if (animateBy === 'words') {
    return String(text || '').split(/(\s+)/).filter((segment) => segment.length);
  }
  return Array.from(String(text || ''));
}

export default function BlurText({
  text = '',
  delay = 24,
  className = '',
  animateBy = 'letters',
  direction = 'top',
  stepDuration = 0.42
}) {
  const segments = useMemo(() => splitSegments(text, animateBy), [text, animateBy]);
  const duration = Math.max(0.16, Number(stepDuration) || 0.42);

  return React.createElement(
    'p',
    {
      className,
      style: {
        '--blur-step-duration': `${duration}s`,
        display: 'flex',
        flexWrap: 'nowrap'
      },
      'data-blur-direction': direction
    },
    segments.map((segment, index) => React.createElement(
      'span',
      {
        className: 'blur-text-segment',
        key: `${segment}-${index}`,
        style: {
          '--blur-index': index,
          '--blur-delay': `${index * delay}ms`
        }
      },
      /^\s+$/.test(segment) ? '\u00a0' : segment
    ))
  );
}
