import './GlitchText.css';

const GlitchText = ({
  children,
  speed = 1,
  intensity = 5,
  enableShadows = true,
  enableOnHover = true,
  className = ''
}) => {
  const safeSpeed = Math.max(0.1, Number(speed) || 1);
  const safeIntensity = Math.max(0, Number(intensity) || 0);
  const inlineStyles = {
    '--after-duration': `${safeSpeed * 3}s`,
    '--before-duration': `${safeSpeed * 2}s`,
    '--glitch-offset': `${safeIntensity}px`,
    '--after-shadow': enableShadows ? `${-safeIntensity}px 0 red` : 'none',
    '--before-shadow': enableShadows ? `${safeIntensity}px 0 cyan` : 'none'
  };
  const hoverClass = enableOnHover ? 'enable-on-hover' : '';

  return (
    <span
      className={`glitch ${hoverClass} ${className}`.trim()}
      style={inlineStyles}
      data-text={children}
    >
      {children}
    </span>
  );
};

export default GlitchText;
