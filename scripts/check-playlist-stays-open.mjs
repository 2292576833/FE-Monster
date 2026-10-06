import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const from=app.indexOf('async function playShelfSong(');
const to=app.indexOf('\nfunction playbackLyricText(',from);
assert.ok(from>=0&&to>from);
for(const fail of [false,true]){
  let open=true,scrollTop=286,focus=0;
  const button={dataset:{songIndex:'2'},classList:{add(){},remove(){}},disabled:false};
  const scope=vm.createContext({
    state:{activePlaylist:{id:'p'},activePlaylistSongs:[{id:0},{id:1},{id:2,title:'Chosen'}],songFocusIndex:0},
    setSongFocus:index=>{focus=index;},safeText:(v,f)=>v||f,toast(){},
    playPlaylistTracks:async(_playlist,_songs,index,options)=>{
      assert.equal(index,2);
      if(fail)throw new Error('unavailable');
      if(options.closeShelf){open=false;scrollTop=0;}
      return {started:{title:'Chosen'}};
    }
  });
  vm.runInContext(app.slice(from,to),scope);
  await scope.playShelfSong(button);
  assert.equal(open,true,'clicking a song keeps the playlist shelf open');
  assert.equal(scrollTop,286,'song selection does not reset the playlist scroll');
  assert.equal(focus,2);assert.equal(button.disabled,false,'loading state is released after success or failure');
}
console.log('PASS playlist remains open at the same scroll position after song selection and failure');
