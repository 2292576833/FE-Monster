(function attachHarmonicSettings(global) {
  'use strict';

  const schema = Object.freeze([
    { key: 'lyricCardsEnabled', label: '歌词卡片', group: '场景', type: 'checkbox', defaultValue: true },
    { key: 'towersEnabled', label: '两侧光柱', group: '场景', type: 'checkbox', defaultValue: true },
    { key: 'audioReactive', label: '跟随音乐', group: '场景', type: 'checkbox', defaultValue: true },
    { key: 'idleAnimation', label: '待机动画', group: '场景', type: 'checkbox', defaultValue: true },
    { key: 'keyLightIntensity', label: '主光强度', group: '灯光', type: 'range', defaultValue: 1, min: 0, max: 2.5, step: 0.05 },
    { key: 'keyLightAzimuth', label: '主光方位', group: '灯光', type: 'range', defaultValue: 30, min: -180, max: 180, step: 5, format: 'degrees' },
    { key: 'keyLightElevation', label: '主光仰角', group: '灯光', type: 'range', defaultValue: 45, min: -10, max: 85, step: 5, format: 'degrees' },
    { key: 'ambientLightIntensity', label: '环境补光', group: '灯光', type: 'range', defaultValue: 0.65, min: 0, max: 1.5, step: 0.05 },
    { key: 'rimLightIntensity', label: '轮廓光强度', group: '灯光', type: 'range', defaultValue: 1, min: 0, max: 2, step: 0.05 },
    { key: 'lightAudioStrength', label: '音乐光照响应', group: '灯光', type: 'range', defaultValue: 0.35, min: 0, max: 1, step: 0.01, format: 'percent' },
    { key: 'ringMetalness', label: '圆环金属感', group: '材质层次', type: 'range', defaultValue: 0.88, min: 0, max: 1, step: 0.01, format: 'percent' },
    { key: 'ringRoughness', label: '圆环粗糙度', group: '材质层次', type: 'range', defaultValue: 0.27, min: 0.08, max: 1, step: 0.01, format: 'percent' },
    { key: 'cubeEdgeGlow', label: '方块边缘亮光', group: '材质层次', type: 'range', defaultValue: 0.45, min: 0, max: 1.5, step: 0.05 },
    { key: 'cubeOcclusion', label: '方块缝隙暗度', group: '材质层次', type: 'range', defaultValue: 0.5, min: 0, max: 1, step: 0.01, format: 'percent' },
    { key: 'towerReflectivity', label: '柱面反光', group: '材质层次', type: 'range', defaultValue: 0.65, min: 0, max: 1.5, step: 0.05 },
    { key: 'towerColorMode', label: '柱子配色', group: '独立颜色', type: 'select', defaultValue: 'palette', options: [
      { value: 'palette', label: '跟随场景配色' }, { value: 'custom', label: '独立颜色' }
    ] },
    { key: 'towerColor', label: '柱子颜色', group: '独立颜色', type: 'color', defaultValue: '#2aeaf4' },
    { key: 'cubeColorMode', label: '中心方块配色', group: '独立颜色', type: 'select', defaultValue: 'palette', options: [
      { value: 'palette', label: '跟随场景配色' }, { value: 'custom', label: '独立颜色' }
    ] },
    { key: 'cubeColor', label: '中心方块颜色', group: '独立颜色', type: 'color', defaultValue: '#7969ff' },
    { key: 'fogColorMode', label: '雾气配色', group: '独立颜色', type: 'select', defaultValue: 'palette', options: [
      { value: 'palette', label: '跟随场景配色' }, { value: 'custom', label: '独立颜色' }
    ] },
    { key: 'fogColor', label: '雾气颜色', group: '独立颜色', type: 'color', defaultValue: '#18ddea' },
    { key: 'glowStrength', label: '局部柔光强度', group: '氛围光', type: 'range', defaultValue: 0.45, min: 0, max: 1.5, step: 0.05 },
    { key: 'glowSoftness', label: '柔光扩散', group: '氛围光', type: 'range', defaultValue: 0.65, min: 0.1, max: 1, step: 0.01, format: 'percent' },
    { key: 'fogLightStrength', label: '雾气透光', group: '氛围光', type: 'range', defaultValue: 0.55, min: 0, max: 1.5, step: 0.05 },
    { key: 'floorLightEnabled', label: '底部光池', group: '氛围光', type: 'checkbox', defaultValue: true },
    { key: 'floorLightStrength', label: '光池亮度', group: '氛围光', type: 'range', defaultValue: 0.45, min: 0, max: 1.5, step: 0.05 },
    { key: 'floorLightSpread', label: '光池范围', group: '氛围光', type: 'range', defaultValue: 1, min: 0.5, max: 1.8, step: 0.05 },
    { key: 'floorShadowStrength', label: '底部柔和暗影', group: '氛围光', type: 'range', defaultValue: 0.3, min: 0, max: 0.8, step: 0.01, format: 'percent' },
    { key: 'ringsEnabled', label: '显示圆环', group: '圆环', type: 'checkbox', defaultValue: true },
    { key: 'ringSpeed', label: '圆环转速', group: '圆环', type: 'range', defaultValue: 0.35, min: 0, max: 2, step: 0.05 },
    { key: 'ringScale', label: '环球大小', group: '圆环', type: 'range', defaultValue: 1, min: 0.65, max: 1.35, step: 0.05 },
    { key: 'ringGlow', label: '环缘亮度', group: '圆环', type: 'range', defaultValue: 0.7, min: 0, max: 1.5, step: 0.05 },
    { key: 'cubeEnabled', label: '中心方块', group: '方块', type: 'checkbox', defaultValue: true },
    { key: 'cubeSize', label: '方块大小', group: '方块', type: 'range', defaultValue: 1, min: 0.6, max: 1.4, step: 0.05 },
    { key: 'cubeHoverHeight', label: '方块悬浮高度', group: '方块', type: 'range', defaultValue: 0, min: -2, max: 3, step: 0.05 },
    { key: 'floatSpeed', label: '呼吸浮动速度', group: '方块', type: 'range', defaultValue: 0.65, min: 0, max: 2, step: 0.05 },
    { key: 'floatAmount', label: '呼吸浮动幅度', group: '方块', type: 'range', defaultValue: 0.55, min: 0, max: 1.5, step: 0.05 },
    { key: 'surfaceRiseEnabled', label: '表面隆起', group: '方块', type: 'checkbox', defaultValue: true },
    { key: 'bassRiseStrength', label: '低频隆起', group: '方块', type: 'range', defaultValue: 0.8, min: 0, max: 5, step: 0.05 },
    { key: 'rippleStrength', label: '涟漪隆起', group: '方块', type: 'range', defaultValue: 0.8, min: 0, max: 2, step: 0.05 },
    { key: 'shakeStrength', label: '低频整体抖动', group: '方块', type: 'range', defaultValue: 0.6, min: 0, max: 2, step: 0.05 },
    { key: 'shakeFrequency', label: '抖动 / 同步闪烁频率', group: '方块', type: 'range', defaultValue: 1, min: 0.25, max: 2.5, step: 0.05 },
    { key: 'flashEnabled', label: '表面小方块闪烁', group: '表面闪烁', type: 'checkbox', defaultValue: true },
    { key: 'flashMode', label: '闪烁方式', group: '表面闪烁', type: 'select', defaultValue: 'shake', options: [
      { value: 'shake', label: '随抖动频率随机闪烁' }, { value: 'random', label: '随机闪烁' }, { value: 'gradient', label: '渐变闪烁' }
    ] },
    { key: 'flashColorA', label: '闪烁颜色一', group: '表面闪烁', type: 'color', defaultValue: '#b8f5ff' },
    { key: 'flashColorB', label: '闪烁颜色二', group: '表面闪烁', type: 'color', defaultValue: '#ba95ff' },
    { key: 'flashColorC', label: '闪烁颜色三', group: '表面闪烁', type: 'color', defaultValue: '#ff8fca' },
    { key: 'flashIntensity', label: '闪烁强度', group: '表面闪烁', type: 'range', defaultValue: 0.65, min: 0, max: 2, step: 0.05 },
    { key: 'flashSpeed', label: '随机 / 渐变闪烁速度', group: '表面闪烁', type: 'range', defaultValue: 0.8, min: 0.1, max: 3, step: 0.05 },
    { key: 'flashDensity', label: '闪烁方块比例', group: '表面闪烁', type: 'range', defaultValue: 0.32, min: 0, max: 1, step: 0.01, format: 'percent' },
    { key: 'flashSoftness', label: '闪烁渐入渐出', group: '表面闪烁', type: 'range', defaultValue: 0.65, min: 0.05, max: 1, step: 0.01, format: 'percent' },
    { key: 'flashAudioStrength', label: '低频增亮', group: '表面闪烁', type: 'range', defaultValue: 0.5, min: 0, max: 2, step: 0.05 },
    { key: 'tileGrid', label: '表面小方块数量', group: '表面方块', type: 'range', defaultValue: 18, min: 8, max: 30, step: 1 },
    { key: 'coldAirEnabled', label: '方块冷气', group: '冷气流', type: 'checkbox', defaultValue: true },
    { key: 'coldAirDensity', label: '冷气密度', group: '冷气流', type: 'range', defaultValue: 0.4, min: 0, max: 1, step: 0.01, format: 'percent' },
    { key: 'coldAirSpeed', label: '冷气流速', group: '冷气流', type: 'range', defaultValue: 0.5, min: 0, max: 2, step: 0.05 },
    { key: 'coldAirSpread', label: '冷气扩散', group: '冷气流', type: 'range', defaultValue: 0.65, min: 0.4, max: 2, step: 0.05 },
    { key: 'coldAirLength', label: '斜面下落长度', group: '冷气流', type: 'range', defaultValue: 0.86, min: 0.35, max: 1.25, step: 0.01, format: 'percent' },
    { key: 'coldAirGroundBlend', label: '地面汇聚', group: '冷气流', type: 'range', defaultValue: 0.8, min: 0, max: 1, step: 0.01, format: 'percent' },
    { key: 'coldAirAudioStrength', label: '冷气低频响应', group: '冷气流', type: 'range', defaultValue: 0.3, min: 0, max: 1.5, step: 0.05 },
    { key: 'coldAirColorMode', label: '冷气配色', group: '冷气流', type: 'select', defaultValue: 'palette', options: [
      { value: 'palette', label: '跟随场景配色' }, { value: 'custom', label: '独立颜色' }
    ] },
    { key: 'coldAirColor', label: '冷气颜色', group: '冷气流', type: 'color', defaultValue: '#b8f5ff' },
    { key: 'bassGain', label: '低频响应', group: '音乐', type: 'range', defaultValue: 1, min: 0, max: 2, step: 0.05 },
    { key: 'midGain', label: '中频响应', group: '音乐', type: 'range', defaultValue: 1, min: 0, max: 2, step: 0.05 },
    { key: 'trebleGain', label: '高频响应', group: '音乐', type: 'range', defaultValue: 1, min: 0, max: 2, step: 0.05 },
    { key: 'raysEnabled', label: '角点粒子束', group: '粒子束', type: 'checkbox', defaultValue: true },
    { key: 'rayDensity', label: '粒子束数量', group: '粒子束', type: 'range', defaultValue: 1, min: 0.3, max: 2, step: 0.1 },
    { key: 'raySpeed', label: '粒子流速', group: '粒子束', type: 'range', defaultValue: 0.8, min: 0, max: 3, step: 0.05 },
    { key: 'rayShake', label: '低频粒子束抖动', group: '粒子束', type: 'range', defaultValue: 0.65, min: 0, max: 2, step: 0.05 },
    { key: 'rainEnabled', label: '粒子雨', group: '粒子雨', type: 'checkbox', defaultValue: true },
    { key: 'rainDensity', label: '雨滴密度', group: '粒子雨', type: 'range', defaultValue: 0.65, min: 0, max: 1, step: 0.01, format: 'percent' },
    { key: 'rainSpeed', label: '下落速度', group: '粒子雨', type: 'range', defaultValue: 0.65, min: 0, max: 2, step: 0.05 },
    { key: 'splashStrength', label: '落点涟漪飞溅', group: '粒子雨', type: 'range', defaultValue: 0.75, min: 0, max: 1.5, step: 0.05 },
    { key: 'breathingEnabled', label: '呼吸光泽', group: '呼吸', type: 'checkbox', defaultValue: true },
    { key: 'breathSpeed', label: '呼吸速度', group: '呼吸', type: 'range', defaultValue: 0.65, min: 0.1, max: 3, step: 0.05 },
    { key: 'breathStrength', label: '呼吸强度', group: '呼吸', type: 'range', defaultValue: 0.55, min: 0, max: 1, step: 0.01, format: 'percent' },
    { key: 'flowEnabled', label: '流动光带', group: '流光', type: 'checkbox', defaultValue: true },
    { key: 'flowDirection', label: '流动方向', group: '流光', type: 'select', defaultValue: 'up', options: [
      { value: 'up', label: '向上' }, { value: 'down', label: '向下' }, { value: 'alternate', label: '上下交替' }
    ] },
    { key: 'flowSpeed', label: '流动速度', group: '流光', type: 'range', defaultValue: 0.65, min: 0.1, max: 3, step: 0.05 },
    { key: 'flowWidth', label: '光带宽度', group: '流光', type: 'range', defaultValue: 0.22, min: 0.05, max: 0.6, step: 0.01, format: 'percent' },
    { key: 'colorMode', label: '配色方式', group: '色彩', type: 'select', defaultValue: 'cycle', options: [
      { value: 'cycle', label: '自动渐变' }, { value: 'cover', label: '封面配色' }, { value: 'custom', label: '自定义三色' }
    ] },
    { key: 'colorSpeed', label: '变色速度', group: '色彩', type: 'range', defaultValue: 0.35, min: 0.05, max: 2, step: 0.05 },
    { key: 'colorA', label: '颜色一', group: '色彩', type: 'color', defaultValue: '#13e8ee' },
    { key: 'colorB', label: '颜色二', group: '色彩', type: 'color', defaultValue: '#7969ff' },
    { key: 'colorC', label: '颜色三', group: '色彩', type: 'color', defaultValue: '#f064c2' },
    { key: 'fogEnabled', label: '流动雾气', group: '雾气', type: 'checkbox', defaultValue: true },
    { key: 'fogDensity', label: '雾气浓度', group: '雾气', type: 'range', defaultValue: 0.4, min: 0, max: 1, step: 0.01, format: 'percent' },
    { key: 'fogSpeed', label: '雾气速度', group: '雾气', type: 'range', defaultValue: 0.45, min: 0, max: 2, step: 0.05 },
    { key: 'fogHeight', label: '雾气高度', group: '雾气', type: 'range', defaultValue: 1, min: 0.4, max: 1.8, step: 0.05 },
    { key: 'fogSpread', label: '雾气范围', group: '雾气', type: 'range', defaultValue: 1, min: 0.4, max: 1.8, step: 0.05 },
    { key: 'waterEnabled', label: '水面场景倒影', group: '水面', type: 'checkbox', defaultValue: true },
    { key: 'waterReflection', label: '倒影强度', group: '水面', type: 'range', defaultValue: 0.65, min: 0, max: 1, step: 0.01, format: 'percent' },
    { key: 'waterClarity', label: '倒影清晰度', group: '水面', type: 'range', defaultValue: 0.75, min: 0, max: 1, step: 0.01, format: 'percent' },
    { key: 'waterDistortion', label: '水面波纹幅度', group: '水面', type: 'range', defaultValue: 0.35, min: 0, max: 1, step: 0.01, format: 'percent' },
    { key: 'waterSpeed', label: '水面波纹速度', group: '水面', type: 'range', defaultValue: 0.4, min: 0, max: 2, step: 0.05 }
  ].map(field => {
    if (field.options) field.options = Object.freeze(field.options.map(option => Object.freeze(option)));
    return Object.freeze(field);
  }));
  const defaults = Object.freeze(Object.fromEntries(schema.map(field => [field.key, field.defaultValue])));

  function normalize(source) {
    const values = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    const result = {};
    for (const field of schema) {
      const value = Object.prototype.hasOwnProperty.call(values, field.key) ? values[field.key] : undefined;
      let normalized = field.defaultValue;
      if (field.type === 'checkbox' && typeof value === 'boolean') normalized = value;
      if (field.type === 'range' && typeof value === 'number' && Number.isFinite(value)) {
        normalized = Math.max(field.min, Math.min(field.max, value));
      }
      if (field.type === 'select' && field.options.some(option => option.value === value)) normalized = value;
      if (field.type === 'color' && typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) normalized = value.toLowerCase();
      result[field.key] = normalized;
    }
    return result;
  }

  global.FeHarmonicSettings = Object.freeze({ defaults, schema, normalize });
})(window);
