import { tsParticles } from "https://esm.sh/@tsparticles/engine";
import { loadSlim } from "https://esm.sh/@tsparticles/slim";

await loadSlim(tsParticles);

await tsParticles.load({
  id: "tsparticles",
  options: {
    background: {
      color: "#010304",
    },
    fpsLimit: 60,
    particles: {
      color: {
        value: ["#83e4ff", "#b8ffe2", "#ffffff"],
      },
      move: {
        direction: "none",
        enable: true,
        outModes: { default: "out" },
        speed: 0.6,
      },
      number: {
        density: { enable: true },
        value: 60,
      },
      opacity: {
        value: { min: 0.2, max: 0.6 },
      },
      size: {
        value: { min: 1, max: 3 },
      },
      wobble: {
        enable: true,
        distance: 8,
        speed: 4,
      },
    },
  },
});
