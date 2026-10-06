(function (global) {
  'use strict';
  const fields = [];
  const options = entries => entries.map(([value, label]) => ({ value, label }));
  const select = (key, label, group, value, entries, when) => fields.push({ key, label, group, type: 'select', defaultValue: value, options: options(entries), when });
  const range = (key, label, group, value, min, max, step = 0.05, when) => fields.push({ key, label, group, type: 'range', defaultValue: value, min, max, step, when });
  const toggle = (key, label, group, value = false, when) => fields.push({ key, label, group, type: 'checkbox', defaultValue: value, when });
  const color = (key, label, value, group = '色彩', when) => fields.push({ key, label, group, type: 'color', defaultValue: value, when });
  const animations = options([['vortex','圆形 · 漩涡甩出'],['corners','方形 · 四角流入'],['burst','星形 · 爆炸回聚'],['breathe','光斑 · 呼吸展开'],['rain','雪花 · 雨落聚合'],['curve','音符 · 曲线流动'],['spiral','螺旋 · 加速收缩'],['direct','文字 · 原位成型']]);
  select('presentation', '歌词呈现方式', '歌词', 'line', [['line','整排聚合'],['progressive','逐字聚合'],['sung','唱到字聚合']]);
  select('glyphStyle', '歌词样式', '歌词', 'solid', [['solid','实心歌词'],['outline','歌词轮廓']]);
  range('textScale','文字大小','歌词',1,0.5,1.6);
  range('textY','文字垂直位置','歌词',0,-0.65,0.65);
  range('density','粒子密度','歌词',0.8,0.3,1,0.05);
  range('particleSize','粒子大小','歌词',2,0.7,5,0.1);
  range('depth','空间纵深','歌词',0.45,0,1);
  range('positionX','水平位置','鼠标调整',0,-1,1,0.01);
  range('positionY','垂直位置','鼠标调整',0,-1,1,0.01);
  range('rotationX','上下倾角 °','鼠标调整',0,-70,70,1);
  range('rotationY','左右倾角 °','鼠标调整',0,-70,70,1);
  range('gestureScale','鼠标缩放','鼠标调整',1,0.35,3,0.05);
  select('shape','待机整体形态','聚合', 'circle', [['circle','圆形'],['square','方形'],['star','星形'],['spot','光斑'],['snowflake','雪花'],['note','音符'],['text','自定义文字'],['custom','自定义图案']]);
  fields.push({key:'idleText',label:'待机文字 · 最多 80 字符 / 3 行',group:'聚合',type:'textarea',defaultValue:'FE MONSTER',when:{shape:['text']}});
  fields.push({key:'customShape',label:'绘制或导入待机图案',group:'聚合',type:'shape',defaultValue:Object.freeze([]),when:{shape:['custom']}});
  range('idleShapeScale','待机文字 / 图案大小','聚合',1,.5,1.8,.05,{shape:['text','custom']});
  range('idleScale','待机整体尺寸','待机',1,.5,2.5,.05);
  fields.push({key:'aggregation',label:'聚合动画',group:'聚合',type:'select',defaultValue:'vortex',options:animations});
  range('aggregateDuration','聚合时间 / 秒','聚合',0.85,0.15,2.5);
  range('scatter','散开范围','聚合',0.7,0.1,2);
  select('material','粒子材质','材质','stardust', [['glass','玻璃'],['bubble','泡泡'],['metal','金属'],['neon','霓虹'],['stardust','星尘'],['hologram','全息'],['water','水'],['fire','火焰'],['ice','冰'],['aurora','极光']]);
  const mat = (...values) => ({ material: values });
  range('refraction','折射率','材质',1.45,1,2.5,0.05,mat('glass','water','ice'));
  range('reflection','反射率','材质',0.6,0,1,0.05,mat('glass','metal','water'));
  range('thickness','厚度','材质',0.5,0.05,1,0.05,mat('glass'));
  range('edgeLight','边缘高光','材质',0.65,0,2,0.05,mat('glass','bubble','ice'));
  range('interference','薄膜干涉色','材质',0.7,0,2,0.05,mat('bubble'));
  range('burstRate','泡泡破裂强度','材质',0.25,0,1,0.05,mat('bubble'));
  range('metalness','金属度','材质',0.9,0,1,0.05,mat('metal'));
  range('roughness','粗糙度','材质',0.25,0,1,0.05,mat('metal'));
  range('emission','自发光强度','材质',1.2,0,3,0.05,mat('neon','fire'));
  range('twinkle','闪烁频率','材质',0.7,0,5,0.1,mat('stardust'));
  range('grain','颗粒感','材质',0.35,0,1,0.05,mat('stardust','ice'));
  range('rainbow','彩虹偏移','材质',0.55,0,2,0.05,mat('hologram','aurora'));
  range('scanlines','扫描线','材质',0.35,0,1,0.05,mat('hologram'));
  range('wave','波动 / 扰动','材质',0.5,0,2,0.05,mat('water','fire','aurora'));
  range('caustics','焦散','材质',0.6,0,2,0.05,mat('water'));
  range('cracks','冰裂纹','材质',0.45,0,1,0.05,mat('ice'));
  range('colorFlow','颜色流动','材质',0.45,0,2,0.05,mat('fire','aurora'));
  select('colorMode','颜色来源','色彩','cover',[['cover','跟随音乐封面'],['custom','自定义颜色']]);
  select('gradientMode','颜色分布','色彩','flow',[['single','整体单色'],['linear','线性渐变'],['flow','流动渐变'],['character','逐字渐变'],['segmented','分段渐变']]);
  color('colorA','颜色一 / 发光颜色','#86edff'); color('colorB','颜色二 / 反射颜色','#9da7ff'); color('colorC','颜色三','#f7b9df');
  range('gradientSpeed','渐变流速','色彩',0.15,0,1,0.01);
  range('gradientSegments','渐变段数','色彩',3,2,8,1);
  toggle('animationColorEnabled','当前聚合动画使用独立配色','色彩');
  toggle('idlePaletteEnabled','待机使用独立配色','待机色彩');
  const idlePalette = {idlePaletteEnabled:[true]};
  select('idleColorMode','待机颜色来源','待机色彩','custom',[['cover','跟随音乐封面'],['custom','自定义颜色']],idlePalette);
  select('idleGradientMode','待机颜色分布','待机色彩','linear',[['single','整体单色'],['linear','线性渐变'],['flow','流动渐变'],['segmented','分段渐变']],idlePalette);
  color('idleColorA','待机颜色一','#86edff','待机色彩',idlePalette);
  color('idleColorB','待机颜色二','#9da7ff','待机色彩',idlePalette);
  color('idleColorC','待机颜色三','#f7b9df','待机色彩',idlePalette);
  range('idleGradientSpeed','待机渐变流速','待机色彩',0.15,0,1,0.01,{...idlePalette,idleGradientMode:['flow']});
  range('idleGradientSegments','待机渐变段数','待机色彩',3,2,8,1,{...idlePalette,idleGradientMode:['segmented']});
  select('lightingPreset','光影氛围预设','光影 · 整体','custom',[['custom','自定义'],['starlight','星海微光'],['aurora','极光薄雾'],['prism','棱镜流光'],['ember','余烬流星'],['moonlight','月色柔光']]);
  range('brightness','亮度','光影 · 整体',1.1,0.1,3);
  range('opacity','透明度','光影 · 整体',0.95,0.05,1);
  range('halo','光晕强度','光影 · 整体',0.45,0,2);
  range('glowRadius','粒子光晕半径','光影 · 整体',1,0.5,2.5);
  range('softness','柔光','光影 · 整体',0.45,0,1);
  range('bloomStrength','Bloom 强度','光影 · 整体',0.55,0,2);
  range('bloomThreshold','Bloom 阈值','光影 · 整体',0.3,0,1);
  range('bloomRadius','Bloom 半径','光影 · 整体',0.65,0,2);
  range('chromatic','RGB 色差','光影 · 边缘与扫光',0.08,0,1);
  range('fresnel','菲涅尔边缘光','光影 · 边缘与扫光',0.45,0,2);
  range('rimLight','彩色轮缘强度','光影 · 边缘与扫光',0.18,0,2);
  range('rimWidth','彩色轮缘宽度','光影 · 边缘与扫光',0.35,0.05,1);
  color('rimColor','轮缘光颜色','#bcecff','光影 · 边缘与扫光');
  range('sweepStrength','斜向扫光强度','光影 · 边缘与扫光',0.16,0,2);
  range('sweepSpeed','扫光速度','光影 · 边缘与扫光',0.18,0,1);
  range('sweepWidth','扫光宽度','光影 · 边缘与扫光',0.18,0.03,1);
  range('sweepAngle','扫光角度 °','光影 · 边缘与扫光',20,-180,180,1);
  range('movingLight','动态光斑','光影 · 边缘与扫光',0.35,0,1);
  range('movingLightSpeed','光斑流动速度','光影 · 边缘与扫光',1,0,3);
  range('laser','镭射星芒','光影 · 星芒与节律',0.25,0,1);
  range('sparkleStrength','随机闪光强度','光影 · 星芒与节律',0.12,0,2);
  range('sparkleSpeed','随机闪光频率','光影 · 星芒与节律',0.7,0.1,5);
  range('sparkleDensity','随机闪光比例','光影 · 星芒与节律',0.12,0,1);
  range('breathingLight','呼吸光','光影 · 星芒与节律',0.15,0,1);
  range('breathingPeriod','呼吸光周期 秒','光影 · 星芒与节律',4,1,8,0.1);
  range('pulseLight','鼓点脉冲光','光影 · 星芒与节律',0.35,0,1);
  range('trail','流星拖尾','光影 · 流星拖尾',0.65,0,1);
  range('trailDecay','拖尾衰减','光影 · 流星拖尾',0.6,0.1,1);
  range('trailLength','拖尾长度','光影 · 流星拖尾',1,0.2,2);
  range('trailDensity','拖尾粒子比例','光影 · 流星拖尾',0.28,0.05,1);
  range('trailBrightness','拖尾亮度','光影 · 流星拖尾',1,0,2);
  color('trailColor','拖尾染色','#c2ddff','光影 · 流星拖尾');
  range('trailColorMix','拖尾染色混合','光影 · 流星拖尾',0,0,1);
  range('volumeLight','背后光雾强度','光影 · 空间与完成',0.12,0,1);
  range('volumeRadius','光雾范围','光影 · 空间与完成',1,0.4,2);
  range('volumeSpeed','光雾流动速度','光影 · 空间与完成',0.18,0,1);
  range('shadow','下方柔影','光影 · 空间与完成',0.2,0,1);
  range('shadowBlur','柔影扩散','光影 · 空间与完成',1,0.4,2);
  range('shadowOffset','柔影上下偏移 px','光影 · 空间与完成',0,-100,100,1);
  range('environment','封面环境反射','光影 · 空间与完成',0.3,0,1);
  range('completionHalo','聚合完成辉光扩散','光影 · 空间与完成',0.45,0,1);
  range('completionDuration','完成光环时长 秒','光影 · 空间与完成',1,0.25,3);
  range('completionRadius','完成光环扩散范围','光影 · 空间与完成',1,0.3,2);
  range('completionWidth','完成光环宽度','光影 · 空间与完成',0.35,0.05,1);
  range('completionRings','完成光环层数','光影 · 空间与完成',1,1,3,1);
  select('idle','粒子待机动画','待机','floatRotate', [['rotate','缓慢旋转'],['breathe','呼吸缩放'],['float','浮动升降'],['pulse','脉冲跳动'],['edge','边缘波动'],['flow','内部流动'],['light','明灭呼吸'],['twinkle','粒子闪烁'],['morph','形状微变'],['twist','螺旋扭转'],['spread','脉冲扩散'],['floatRotate','漂浮旋转'],['bass','低音响应'],['beat','节拍响应'],['mood','情绪响应（能量估计）']]);
  toggle('idleDisabled','关闭待机','待机');
  toggle('skipIdleForLyrics','有歌词的音乐不进入待机','待机');
  select('idlePreset','待机强度预设','待机','gentle',[['gentle','轻柔'],['medium','适中'],['strong','强烈']]);
  range('rotationSpeed','旋转速度 °/s','待机',10,5,60,1);
  select('direction','旋转 / 流动方向','待机','clockwise',[['clockwise','顺时针'],['counter','逆时针']]);
  range('breathAmount','呼吸 / 脉冲幅度','待机',0.1,0.05,0.3,0.01);
  range('period','呼吸 / 明灭周期 秒','待机',4,1,6,0.1);
  range('floatAmount','浮动幅度 px','待机',10,5,30,1);
  range('floatPeriod','浮动周期 秒','待机',2,0.5,2,0.1);
  range('pulsePeriod','脉冲间隔 秒','待机',1,0.2,2,0.1);
  toggle('beatSync','脉冲跟随鼓点','待机',true);
  range('edgeAmount','边缘波幅 px','待机',4,2,10,1);
  range('wavelength','边缘波长','待机',4,1,12,1);
  range('idleSpeed','波动 / 流动 / 闪烁速度','待机',0.5,0.1,2);
  range('flowLayers','内部流动层数','待机',1,1,3,1);
  range('idleParticleSize','待机粒子大小','待机',2,0.7,5,0.1);
  range('minBrightness','最低亮度','待机',0.35,0.05,0.9);
  range('visibleRatio','闪烁可见比例','待机',0.7,0.1,1);
  range('morphAmount','形变幅度','待机',0.15,0,0.6);
  range('twistAngle','扭转角度 °','待机',15,0,45,1);
  range('spreadRadius','扩散半径','待机',0.3,0.05,1);
  range('audioStrength','低音 / 节拍 / 情绪响应','待机',0.65,0,2);
  range('bassThreshold','低频阈值','待机',0.15,0,0.8);
  range('fallSpeed','节拍回落速度','待机',0.5,0.1,2);
  select('display','聚合途中显示','显示','continuous',[['continuous','连续显示'],['beat','鼓点显示'],['segments','分段显示'],['breathe','呼吸显示'],['segmentBreathe','分段呼吸显示']]);
  range('displayThreshold','鼓点显示阈值','显示',0.2,0,0.9);
  range('displaySegments','显示段数','显示',4,2,12,1);
  range('displayPeriod','显示呼吸周期 秒','显示',1.5,0.2,4,0.1);

  const presetLevels=['gentle','medium','strong'];
  const presets=(labels,values)=>Object.freeze(Object.fromEntries(presetLevels.map((key,i)=>[key,Object.freeze({label:labels[i],values:Object.freeze(values[i])})])));
  const idlePresets=Object.freeze({
    rotate:presets(['慢转 · 10°/s','中转 · 30°/s','快转 · 60°/s'],[{rotationSpeed:10},{rotationSpeed:30},{rotationSpeed:60}]),
    breathe:presets(['轻呼吸 · 10% / 4s','中呼吸 · 20% / 3s','深呼吸 · 30% / 2s'],[{breathAmount:0.1,period:4},{breathAmount:0.2,period:3},{breathAmount:0.3,period:2}]),
    float:presets(['轻浮 · 10px','中浮 · 20px','重浮 · 30px'],[{floatAmount:10,floatPeriod:2},{floatAmount:20,floatPeriod:1.2},{floatAmount:30,floatPeriod:0.7}]),
    pulse:presets(['慢脉冲 · 1s','中脉冲 · 0.5s','快脉冲 · 0.2s'],[{pulsePeriod:1,breathAmount:0.1,beatSync:false},{pulsePeriod:0.5,breathAmount:0.2,beatSync:false},{pulsePeriod:0.2,breathAmount:0.3,beatSync:false}]),
    edge:presets(['微波','中波','大波'],[{edgeAmount:2,wavelength:6,idleSpeed:0.3},{edgeAmount:5,wavelength:4,idleSpeed:0.7},{edgeAmount:10,wavelength:2,idleSpeed:1.2}]),
    flow:presets(['单层流','双层反向流','三层流'],[{flowLayers:1,idleSpeed:0.3},{flowLayers:2,idleSpeed:0.6},{flowLayers:3,idleSpeed:1}]),
    light:presets(['慢明灭 · 4s','中明灭 · 2s','快明灭 · 1s'],[{period:4,minBrightness:0.55},{period:2,minBrightness:0.35},{period:1,minBrightness:0.1}]),
    twinkle:presets(['稀疏闪','密集闪','随机闪'],[{visibleRatio:0.25,idleSpeed:0.3},{visibleRatio:0.8,idleSpeed:1},{visibleRatio:0.5,idleSpeed:1.8}]),
    morph:presets(['微变形','中变形','大变形'],[{morphAmount:0.08,idleSpeed:0.3},{morphAmount:0.25,idleSpeed:0.6},{morphAmount:0.5,idleSpeed:1}]),
    twist:presets(['轻扭 · 15°','中扭 · 30°','重扭 · 45°'],[{twistAngle:15,idleSpeed:0.3},{twistAngle:30,idleSpeed:0.6},{twistAngle:45,idleSpeed:1}]),
    spread:presets(['轻扩散','中扩散','重扩散'],[{spreadRadius:0.2,period:4,idleSpeed:0.5},{spreadRadius:0.45,period:2,idleSpeed:1},{spreadRadius:0.8,period:1,idleSpeed:1.5}]),
    floatRotate:presets(['轻飘','中飘','重飘'],[{floatAmount:10,floatPeriod:2,rotationSpeed:10},{floatAmount:20,floatPeriod:1.4,rotationSpeed:30},{floatAmount:30,floatPeriod:0.8,rotationSpeed:60}]),
    bass:presets(['弱响应','中响应','强响应'],[{audioStrength:0.4,bassThreshold:0.3},{audioStrength:0.9,bassThreshold:0.15},{audioStrength:1.6,bassThreshold:0.05}]),
    beat:presets(['轻跳','中跳','重跳'],[{audioStrength:0.4,fallSpeed:1.3},{audioStrength:0.9,fallSpeed:0.7},{audioStrength:1.5,fallSpeed:0.3}]),
    mood:presets(['弱映射','中映射','强映射'],[{audioStrength:0.35,rotationSpeed:10,floatAmount:10},{audioStrength:0.85,rotationSpeed:25,floatAmount:20},{audioStrength:1.4,rotationSpeed:45,floatAmount:30}])
  });
  const idleFields={rotationSpeed:['rotate','floatRotate','mood'],direction:['rotate','flow','floatRotate','mood'],breathAmount:['breathe','pulse'],period:['breathe','light','spread'],floatAmount:['float','floatRotate','mood'],floatPeriod:['float','floatRotate','mood'],pulsePeriod:['pulse'],beatSync:['pulse'],edgeAmount:['edge'],wavelength:['edge'],idleSpeed:['edge','flow','twinkle','morph','twist','spread'],flowLayers:['flow'],minBrightness:['light'],visibleRatio:['twinkle'],morphAmount:['morph'],twistAngle:['twist'],spreadRadius:['spread'],audioStrength:['bass','beat','mood'],bassThreshold:['bass'],fallSpeed:['beat']};
  for(const field of fields)if(idleFields[field.key])field.when={idle:idleFields[field.key]};
  const schema = Object.freeze(fields.map(field => Object.freeze(field)));
  const defaults = Object.freeze(Object.fromEntries(schema.map(field => [field.key, field.defaultValue])));
  const lightingDefaults=Object.freeze(Object.fromEntries(schema.filter(field=>field.group.startsWith('光影')&&field.key!=='lightingPreset').map(field=>[field.key,field.defaultValue])));
  // Presets replace lighting only. Typography, text palettes, material, motion
  // and media timing remain untouched, including animation-scoped palettes.
  const lightingPresets=Object.freeze(Object.fromEntries([
    ['starlight','星海微光',{halo:0.4,glowRadius:1.15,brightness:1.05,bloomStrength:0.5,bloomThreshold:0.38,laser:0.32,sparkleStrength:0.6,sparkleSpeed:0.55,sparkleDensity:0.18,rimLight:0.22,rimColor:'#bcecff',sweepStrength:0.1,volumeLight:0.08,trailBrightness:0.85,completionRings:2,completionDuration:1.4}],
    ['aurora','极光薄雾',{halo:0.62,glowRadius:1.5,softness:0.72,bloomStrength:0.48,bloomRadius:1.1,laser:0.1,rimLight:0.25,rimColor:'#a3ffe8',sweepStrength:0.24,sweepSpeed:0.1,sweepWidth:0.4,sweepAngle:35,sparkleStrength:0.08,volumeLight:0.42,volumeRadius:1.3,volumeSpeed:0.12,trailColor:'#c3aaff',trailColorMix:0.25,breathingLight:0.25,breathingPeriod:6,completionWidth:0.55,completionDuration:2}],
    ['prism','棱镜流光',{halo:0.32,glowRadius:0.9,bloomStrength:0.42,bloomThreshold:0.5,chromatic:0.24,fresnel:0.8,rimLight:0.7,rimWidth:0.2,rimColor:'#dcceff',sweepStrength:0.7,sweepSpeed:0.22,sweepWidth:0.09,sweepAngle:-30,sparkleStrength:0.38,sparkleDensity:0.08,volumeLight:0.05,trailLength:0.8,completionWidth:0.16,completionRings:2}],
    ['ember','余烬流星',{halo:0.52,glowRadius:1.15,bloomStrength:0.58,bloomThreshold:0.36,rimLight:0.38,rimColor:'#ffc991',sweepStrength:0.12,sparkleStrength:0.4,sparkleSpeed:1.2,sparkleDensity:0.16,volumeLight:0.16,trail:0.9,trailLength:1.55,trailDensity:0.42,trailBrightness:1.15,trailDecay:0.45,trailColor:'#ffb27c',trailColorMix:0.65,completionRadius:1.25,completionDuration:1.3}],
    ['moonlight','月色柔光',{brightness:0.98,halo:0.48,glowRadius:1.7,softness:0.85,bloomStrength:0.35,bloomThreshold:0.4,bloomRadius:1.1,laser:0.06,chromatic:0.02,fresnel:0.3,rimLight:0.2,rimWidth:0.55,rimColor:'#dce9ff',sweepStrength:0.08,sweepSpeed:0.06,sweepWidth:0.45,sparkleStrength:0.12,sparkleSpeed:0.25,sparkleDensity:0.06,movingLight:0.15,movingLightSpeed:0.35,volumeLight:0.18,volumeRadius:1.2,volumeSpeed:0.06,breathingLight:0.2,breathingPeriod:7,pulseLight:0.12,trail:0.4,trailBrightness:0.65,shadow:0.25,shadowBlur:1.5,completionDuration:2.4,completionWidth:0.65}]
  ].map(([key,label,values])=>[key,Object.freeze({label,values:Object.freeze({...lightingDefaults,...values})})])));
  function normalize(input) {
    const source = input && typeof input === 'object' ? input : {};
    const result = {};
    for (const field of schema) {
      const value = Object.prototype.hasOwnProperty.call(source,field.key) ? source[field.key] : undefined;
      result[field.key] = field.defaultValue;
      if (field.type === 'checkbox' && typeof value === 'boolean') result[field.key] = value;
      if (field.type === 'range' && typeof value === 'number' && Number.isFinite(value)) result[field.key] = Math.min(field.max, Math.max(field.min, field.step === 1 ? Math.round(value) : value));
      if (field.type === 'select' && field.options.some(option => option.value === value)) result[field.key] = value;
      if (field.type === 'color' && /^#[\da-f]{6}$/i.test(value)) result[field.key] = value.toLowerCase();
      if(field.type==='textarea'&&typeof value==='string')result[field.key]=Array.from(value.replace(/\r\n?/g,'\n').split('\n').slice(0,3).join('\n')).slice(0,80).join('');
      if(field.type==='shape')result[field.key]=Array.isArray(value)?value.slice(0,1024).filter(point=>Array.isArray(point)&&point.length===2
        &&point.every(coordinate=>typeof coordinate==='number'&&Number.isFinite(coordinate)))
        .map(point=>point.map(coordinate=>Math.min(1,Math.max(-1,coordinate)))):[];
    }
    result.animationColors = {};
    for (const animation of animations) {
      const value = source.animationColors?.[animation.value];
      if (value && ['colorA','colorB','colorC'].every(key => /^#[\da-f]{6}$/i.test(value[key]))) {
        result.animationColors[animation.value] = Object.fromEntries(['colorA','colorB','colorC'].map(key => [key,value[key].toLowerCase()]));
      }
    }
    // The checkbox represents the selected animation; its value is not global.
    // Old saved palettes are migrated without discarding their colors.
    result.animationPaletteEnabled={};
    for(const {value} of animations){
      const supplied=source.animationPaletteEnabled?.[value];
      result.animationPaletteEnabled[value]=typeof supplied==='boolean'?supplied:source.animationColorEnabled===true&&(value===result.aggregation||!!result.animationColors[value]);
    }
    result.animationColorEnabled=result.animationPaletteEnabled[result.aggregation];
    return result;
  }
  function change(settings, key, value) {
    const previous=normalize(settings);
    const next = normalize({ ...previous, [key]: value });
    if(key==='customShape')next.shape='custom';
    if(key==='lightingPreset'&&lightingPresets[next.lightingPreset])Object.assign(next,lightingPresets[next.lightingPreset].values);
    else if(Object.prototype.hasOwnProperty.call(lightingDefaults,key))next.lightingPreset='custom';
    if (key === 'idlePreset'||key==='idle')Object.assign(next,idlePresets[next.idle][next.idlePreset].values);
    if(key==='animationColorEnabled'){
      next.animationPaletteEnabled[next.aggregation]=value===true;next.animationColorEnabled=value===true;
      if(value===true&&!next.animationColors[next.aggregation])next.animationColors[next.aggregation]={colorA:previous.colorA,colorB:previous.colorB,colorC:previous.colorC};
    }
    if (['colorA','colorB','colorC'].includes(key)) {
      if (next.animationColorEnabled) {
        next.animationColors[next.aggregation] = { ...(next.animationColors[next.aggregation] || {colorA:previous.colorA,colorB:previous.colorB,colorC:previous.colorC}), [key]: next[key] };
        next[key] = previous[key];
      } else next.colorMode = 'custom';
    }
    if (['idleColorA','idleColorB','idleColorC'].includes(key)) next.idleColorMode = 'custom';
    return next;
  }
  const shapeEditors=new WeakMap();
  function syncControls(host, settings) {
    for (const field of schema) {
      const control = host.querySelector(`[data-particle-setting="${field.key}"]`);
      if (!control) continue;
      const row = control.closest('.particle-setting');
      row.hidden = !!field.when && !Object.entries(field.when).every(([key, values]) => values.includes(settings[key]));
      if(field.type==='shape'){shapeEditors.get(control)?.sync(settings.customShape,settings.shape==='custom');continue;}
      if(field.key==='idlePreset')for(const option of control.options)option.textContent=idlePresets[settings.idle][option.value].label;
      if(field.key==='animationColorEnabled')row.querySelector('label').textContent=`${animations.find(animation=>animation.value===settings.aggregation).label} · 独立配色`;
      const scoped = settings.animationColorEnabled && settings.animationColors[settings.aggregation];
      const value = ['colorA','colorB','colorC'].includes(field.key) && scoped ? scoped[field.key] : settings[field.key];
      if (field.type === 'checkbox') control.checked = value;
      else if(control.dataset.composing!=='true'&&control.value!==String(value)){
        const focused=field.type==='textarea'&&document.activeElement===control;
        const start=focused?control.selectionStart:null,end=focused?control.selectionEnd:null,direction=focused?control.selectionDirection:null;
        control.value=String(value);
        if(focused)control.setSelectionRange(Math.min(start,control.value.length),Math.min(end,control.value.length),direction||'none');
      }
      if(field.type==='textarea'&&control.dataset.composing!=='true')control.dataset.committedValue=String(value);
      const output = row.querySelector('output');
      if (output) output.textContent = typeof value === 'number' ? String(Number(value.toFixed(2))) : value;
    }
  }
  function renderControls(host, settings, onChange) {
    if (host.dataset.particleControls === 'true') { syncControls(host,settings); return; }
    host.replaceChildren(); host.dataset.particleControls = 'true';
    const intro = document.createElement('p'); intro.className='particle-settings-note';
    intro.textContent='歌词和待机形态都可在中间拖动位置、两侧拖动角度，用滚轮调整大小；位置、角度与缩放共用并自动保存。待机默认沿用歌词色彩，可展开「待机色彩」单独调色、设置渐变和流速。逐字与唱到字模式跟随音频时间戳；快字自动缩短聚合时间，没有字时间戳时按行估算。鼓点、分段和呼吸显示只影响飞行粒子，成形歌词保留渐变。待机整体形态与聚合轨迹可自由搭配；聚合动画独立配色仅作用于当前动画。材质为实时粒子光学风格，情绪响应按音乐能量估计。'; host.append(intro);
    const groups = new Map();
    for (const field of schema) {
      if (!groups.has(field.group)) {
        const group=document.createElement('details');group.className='particle-settings-group';group.open=['歌词','聚合'].includes(field.group);
        const summary=document.createElement('summary');summary.textContent=field.group;group.append(summary);host.append(group);groups.set(field.group,group);
      }
      const row=document.createElement('div');row.className=`particle-setting particle-setting--${field.type}`;
      const label=document.createElement('label');label.textContent=field.label;label.htmlFor=`particle-lyrics-${field.key}`;
      const control=document.createElement(field.type==='select'?'select':field.type==='textarea'?'textarea':field.type==='shape'?'div':'input');control.id=label.htmlFor;control.dataset.particleSetting=field.key;
      if(field.type==='select') for(const option of field.options){const item=document.createElement('option');item.value=option.value;item.textContent=option.label;control.append(item);}
      else if(field.type==='shape'){
        control.className='particle-shape-editor';control.setAttribute('role','group');control.setAttribute('aria-label',field.label);
        if(global.FeParticleIdleShapeEditor?.create)shapeEditors.set(control,global.FeParticleIdleShapeEditor.create(control,onChange));
        else control.textContent='图案编辑器尚未加载，请刷新页面后重试。';
      }
      else if(field.type==='textarea'){
        control.rows=3;control.spellcheck=false;control.placeholder='输入待机时由粒子组成的文字';
        const commit=()=>{if(control.dataset.composing==='true'||control.value===control.dataset.committedValue)return;
          control.dataset.committedValue=control.value;onChange(field.key,control.value);};
        control.addEventListener('compositionstart',()=>{control.dataset.composing='true';});
        control.addEventListener('compositionend',()=>{control.dataset.composing='false';commit();});
        control.addEventListener('input',commit);
      }
      else {control.type=field.type;if(field.type==='range')Object.assign(control,{min:field.min,max:field.max,step:field.step});}
      if(!['shape','textarea'].includes(field.type))control.addEventListener(['select','checkbox'].includes(field.type)?'change':'input',()=>onChange(field.key,field.type==='checkbox'?control.checked:field.type==='range'?Number(control.value):control.value));
      row.append(label,control);
      if(['range','color'].includes(field.type)){const output=document.createElement('output');output.htmlFor=control.id;row.append(output);}
      groups.get(field.group).append(row);
    }
    const reset=document.createElement('button');reset.type='button';reset.className='particle-settings-reset';reset.textContent='恢复粒子歌词默认设置';reset.addEventListener('click',()=>onChange('reset'));host.append(reset);
    syncControls(host,settings);
  }
  global.FeParticleLyricsSettings=Object.freeze({schema,defaults,normalize,change,animations,idlePresets,lightingPresets,renderControls,syncControls});
})(window);
