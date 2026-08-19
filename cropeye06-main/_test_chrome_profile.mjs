import { chromium } from 'playwright';
const API = 'https://cropeye-backendd.up.railway.app/api';
function pickArray(...candidates) {
  let fallback = null;
  for (const c of candidates) {
    if (Array.isArray(c)) { if (c.length > 0) return c; if (fallback == null) fallback = c; continue; }
    if (c && typeof c === 'object') {
      for (const key of ['results','data','farmers','farmer_list','field_officers','items']) {
        const nested = c[key];
        if (Array.isArray(nested) && nested.length > 0) return nested;
        if (Array.isArray(nested) && fallback == null) fallback = nested;
      }
    }
  }
  return fallback ?? [];
}
async function apiGet(path, token) {
  const res = await fetch(API + path, { headers: { Accept: 'application/json', Authorization: 'Bearer ' + token } });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}
const userData = process.env.LOCALAPPDATA + '\\Google\\Chrome\\User Data';
const context = await chromium.launchPersistentContext(userData, {
  channel: 'chrome',
  headless: true,
  args: ['--profile-directory=Default', '--disable-extensions'],
});
try {
  const page = await context.newPage();
  let token = null;
  for (const origin of ['http://localhost:5173','http://localhost:3001','http://127.0.0.1:5173']) {
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 10000 });
      token = await page.evaluate(() => localStorage.getItem('access_token') || localStorage.getItem('token'));
      if (token) { console.log('Token from', origin); break; }
    } catch (e) { console.log('skip', origin, String(e.message||e).slice(0,80)); }
  }
  if (!token) { console.error('No token in Chrome Default profile localStorage'); process.exit(1); }
  const me = await apiGet('/users/me/', token);
  console.log('me', me.status, { id: me.data?.id, name: (me.data?.first_name||'')+' '+(me.data?.last_name||''), role: me.data?.role || me.data?.role_id });
  const hier = await apiGet('/users/owner-hierarchy/', token);
  const managers = pickArray(hier.data?.managers, hier.data?.manager, hier.data?.results);
  console.log('managers', managers.length);
  const tea = managers.find(m => ((m.first_name||'')+' '+(m.last_name||'')).toLowerCase().includes('tea')) || managers[0];
  const mid = tea?.id ?? tea?.user_id;
  console.log('tea manager', mid, (tea?.first_name||'')+' '+(tea?.last_name||''), 'nestedFO', pickArray(tea?.field_officers).length, 'count', tea?.field_officers_count);
  const detail = await apiGet('/users/owner-hierarchy/?manager_id='+encodeURIComponent(mid), token);
  console.log('detail status', detail.status, 'keys', Object.keys(detail.data||{}));
  const dManagers = pickArray(detail.data?.managers, detail.data?.manager);
  const match = dManagers.find(m => String(m?.id??m?.user_id)===String(mid)) || dManagers[0] || (String(detail.data?.id)===String(mid)?detail.data:null);
  const fos = pickArray(match?.field_officers, match?.fieldOfficers, detail.data?.field_officers);
  const flat = pickArray(match?.farmers, detail.data?.farmers);
  console.log('FOs', fos.length, 'flatFarmers', flat.length);
  for (const fo of fos) {
    const farmers = pickArray(fo.farmers, fo.farmer_list, fo.farmer, fo.assigned_farmers);
    console.log('FO', fo.id, (fo.first_name||'')+' '+(fo.last_name||''), 'farmers', farmers.length, 'keys', Object.keys(fo).slice(0,20).join(','));
    if (farmers[0]) console.log('  farmer0', farmers[0].id, (farmers[0].first_name||'')+' '+(farmers[0].last_name||''), 'plots', pickArray(farmers[0].plots).length);
  }
  if (fos[0]) {
    const foId = fos[0].id ?? fos[0].user_id;
    const fr = await apiGet('/users/farmers-by-field-officer/'+foId+'/', token);
    const farmers = pickArray(fr.data?.farmers, fr.data?.results, fr.data?.data, Array.isArray(fr.data)?fr.data:null);
    console.log('farmers-by-field-officer', foId, 'status', fr.status, 'count', farmers.length);
  }
  console.log('\\nVERDICT:');
  const any = fos.some(fo => pickArray(fo.farmers, fo.farmer_list, fo.farmer).length > 0);
  if (!fos.length) console.log('INCOMPLETE: no field_officers in manager_id detail');
  else if (!any && !flat.length) console.log('BACKEND DATA: FO present but farmers NOT in hierarchy response — UI correctly shows 0 farmers');
  else if (!any && flat.length) console.log('FARMERS FLAT in response — frontend must map them');
  else console.log('OK: nested farmers present — frontend should show them if parsing works');
} finally { await context.close(); }
