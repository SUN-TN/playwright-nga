import json from './output/tid_45974302_2026-06-25_10-22-23.json';

const filterNames = ['树','图','狼']
const users = json.users.filter(user=> filterNames.some(name=>user.username.includes(name)))

console.log('uid             name');
users.forEach(user => {
  console.log(`${user.uid}   ${user.username}`);
});
