import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0?bundle';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
});
const root = document.querySelector('#app');
const nav = document.querySelector('#navigation');
const account = document.querySelector('#account-actions');
const cartBar = document.querySelector('#cart-bar');
const money = cents => '₱' + (Number(cents || 0) / 100).toLocaleString('en-PH', {minimumFractionDigits:2,maximumFractionDigits:2});
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8l-6.2 3.2 1.2-6.8-5-4.9 6.9-1L12 2Z"/></svg>';
const shopSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10h18l-2-6H5l-2 6ZM4 10v10h16V10M9 20v-7h6v7"/></svg>';
const states = ['placed','accepted','preparing','ready_for_pickup','out_for_delivery','completed','rejected','cancelled'];
const nextStatus = (order) => ({
  placed:['accepted','rejected'],
  accepted:['preparing'],
  preparing:order.method === 'pickup' ? ['ready_for_pickup'] : ['out_for_delivery'],
  ready_for_pickup:['completed'],out_for_delivery:['completed']
})[order.status] || [];
const state = {user:null,role:{is_admin:false,shop_id:null},view:'home',shops:[],items:[],
  selectedShop:null,selectedItem:null,shop:null,sellerItems:[],orders:[],sellerOrders:[],adminShops:[],adminOrders:[],
  search:'',category:'all',cart:readCart(),method:'pickup',busy:false,requestId:null};
let toastTimer;
function readCart(){try{const x=JSON.parse(localStorage.getItem('tabo-cart-v1')||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function saveCart(){localStorage.setItem('tabo-cart-v1',JSON.stringify(state.cart));state.requestId=null;updateCartBar()}
function flash(message){const el=document.querySelector('#message');el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,5000)}
function imgTag(url,alt,cl='card-image'){
 if(typeof url==='string' && /^https:\/\//i.test(url))
  return '<img class="'+cl+'" src="'+esc(url)+'" alt="'+esc(alt)+'" loading="lazy">';
 return '<div class="'+cl+' fallback" aria-label="No image available">'+shopSvg+'</div>';
}
function cartLines(){
 return state.cart.map(x=>({qty:x.qty,item:state.items.find(i=>i.id===x.id)}))
  .filter(x=>x.item && x.qty>0);
}
function currentShopForCart(){return state.shops.find(s=>s.id===state.cart[0]?.shop_id)}
function cartTotal(){
 const lines=cartLines(),shop=currentShopForCart();
 return lines.reduce((n,x)=>n+x.item.price_cents*x.qty,0)+(state.method==='delivery' && shop ? shop.delivery_fee_cents : 0);
}
function updateCartBar(){
 const count=cartLines().reduce((n,x)=>n+x.qty,0);
 cartBar.hidden=!(count>0 && ['home','shop','product'].includes(state.view));
 cartBar.innerHTML='<span>'+count+' item'+(count===1?'':'s')+'</span><span>View cart · '+money(cartTotal())+'</span>';
}
function paintNav(){
 const links=[['home','Discover']];
 if(state.user){links.push(['seller','Seller']);if(state.role.is_admin)links.push(['admin','Admin']);links.push(['orders','Orders'])}
 nav.innerHTML=links.map(([key,label])=>'<button type="button" class="nav-link '+(state.view===key?'active':'')+
  '" data-action="navigate" data-view="'+key+'">'+label+'</button>').join('');
 const label=state.user ? esc(state.user.user_metadata?.full_name || state.user.email?.split('@')[0] || 'Account') : '';
 account.innerHTML=state.user
  ? '<div class="account"><span class="account-name small muted">'+label+'</span><button class="btn sm" data-action="signout">Sign out</button></div>'
  : '<button class="btn sm" data-action="signin">Sign in with Google</button>';
 updateCartBar();
}
function noteEmpty(title,description,action=''){
 return '<div class="empty"><strong>'+esc(title)+'</strong><p class="small">'+esc(description)+'</p>'+action+'</div>';
}
function findShop(id){return state.shops.find(s=>s.id===id)}
function findItem(id){return state.items.find(x=>x.id===id)}
function itemCard(item){
 const shop=findShop(item.shop_id);
 return '<button type="button" class="item-card" data-action="item" data-id="'+esc(item.id)+'">'+
 imgTag(item.image_url,item.name)+
 '<span class="card-body"><span class="card-caption">'+esc(shop?.name||'Local shop')+'</span>'+
 '<span class="card-title">'+esc(item.name)+'</span><span class="card-footer">'+money(item.price_cents)+'</span></span></button>';
}
function shopCard(shop){
 const types=[shop.offers_pickup?'Pickup':'',shop.offers_delivery?'Shop delivery':''].filter(Boolean).join(' · ');
 return '<button type="button" class="shop-card" data-action="shop" data-id="'+esc(shop.id)+'">'+
 '<span class="card-image fallback">'+shopSvg+'</span>'+
 '<span class="card-body"><span class="card-title">'+esc(shop.name)+'</span>'+
 '<span class="card-caption">'+esc(shop.description||'Food made by a local seller')+'</span>'+
 '<span class="card-footer">'+esc(types)+'</span></span></button>';
}
function renderHome(){
 const q=state.search.toLowerCase();
 const chips=['All','Meals','Snacks','Drinks']; // simple discovery categories until seller-defined categories are added
 const shops=state.shops.filter(s=>(s.name+' '+(s.description||'')).toLowerCase().includes(q)
   || state.items.some(i=>i.shop_id===s.id && i.name.toLowerCase().includes(q)));
 const items=state.items.filter(i=>!q || (i.name+' '+(findShop(i.shop_id)?.name||'')).toLowerCase().includes(q));
 root.innerHTML='<section class="hero"><div class="hero-text"><span class="hero-eyebrow">LOCAL FOOD, SIMPLE ORDERING</span>'+
 '<h1>Good food.<br>Less friction.</h1><p>Find local shops, order in a few taps, and choose pickup or delivery offered by the shop.</p></div>'+
 '<div class="hero-art" role="img" aria-label="Warm food-inspired illustration"></div></section>'+
 '<section class="section"><div class="section-head"><h2>Popular shops</h2><p>Explore shops near your community.</p></div>'+
 (shops.length?'<div class="shops">'+shops.map(shopCard).join('')+'</div>':
 noteEmpty('No shops available yet','Sellers can apply from the Seller tab; approved shops appear here.'))+'</section>'+
 '<section class="section"><div class="section-head"><h2>Items from shops</h2><p>Select a dish to see its details and add it to your cart.</p></div>'+
 (items.length?'<div class="items">'+items.map(itemCard).join('')+'</div>':
 noteEmpty('No food items yet','Food items will appear when shops publish their menus.'))+'</section>';
}
function renderShop(){
 const s=findShop(state.selectedShop);
 if(!s){state.view='home';return renderHome()}
 const menu=state.items.filter(i=>i.shop_id===s.id);
 root.innerHTML='<button class="btn sm" data-action="navigate" data-view="home">← All shops</button>'+
 '<section class="section"><h1>'+esc(s.name)+'</h1><p class="muted">'+esc(s.description||'Local food shop')+'</p>'+
 '<div class="toolbar"><span class="pill green">'+(s.is_open?'Open':'Closed')+'</span>'+
 (s.offers_pickup?'<span class="pill">Pickup</span>':'')+
 (s.offers_delivery?'<span class="pill">Shop delivery · '+money(s.delivery_fee_cents)+'</span>':'')+'</div></section>'+
 '<section class="section"><h2>Menu</h2>'+(menu.length?'<div class="items">'+menu.map(itemCard).join('')+'</div>':
 noteEmpty('Menu coming soon','This shop has not published any food items yet.'))+'</section>';
}
function renderProduct(){
 const item=findItem(state.selectedItem);
 const shop=item&&findShop(item.shop_id);
 if(!item||!shop){state.view='home';return renderHome()}
 root.innerHTML='<button class="btn sm" data-action="shop" data-id="'+esc(shop.id)+'">← '+esc(shop.name)+'</button>'+
 '<section class="section prod-top"><div>'+imgTag(item.image_url,item.name,'prod-image')+'</div><div>'+
 '<p class="small muted">'+esc(shop.name)+'</p><h1 class="item-title">'+esc(item.name)+'</h1>'+
 '<p class="muted">'+esc(item.description||'Freshly prepared by the shop.')+'</p>'+
 '<p class="big-price">'+money(item.price_cents)+'</p>'+
 '<p class="small muted">'+(shop.offers_delivery?'Shop delivery available':'Pickup only')+'</p>'+
 '<button class="btn primary block" data-action="add" data-id="'+esc(item.id)+'">Add to cart</button></div></section>';
}
function renderCart(){
 const lines=cartLines(),shop=currentShopForCart();
 if(!lines.length||!shop){
  root.innerHTML='<h1>Your cart</h1>'+noteEmpty('Nothing in your cart','Browse local food items to get started.','<button class="btn primary" data-action="navigate" data-view="home">Browse food</button>');
  return;
 }
 if(state.method==='delivery'&&!shop.offers_delivery)state.method='pickup';
 root.innerHTML='<h1>Your cart</h1><div class="two"><section class="panel"><div class="panel-head"><h2>'+esc(shop.name)+'</h2>'+
 '<button class="btn sm" data-action="navigate" data-view="home">Add more</button></div>'+
 lines.map(({item,qty})=>'<div class="list-row"><div><strong>'+esc(item.name)+'</strong><span class="small muted">'+money(item.price_cents)+' each</span></div>'+
 '<div class="qty"><button data-action="qty" data-id="'+esc(item.id)+'" data-change="-1" aria-label="Remove one">−</button>'+
 '<strong>'+qty+'</strong><button data-action="qty" data-id="'+esc(item.id)+'" data-change="1" aria-label="Add one">+</button></div></div>').join('')+
 '</section><section class="panel"><h2>Order details</h2><p class="small muted">The shop handles preparation and fulfillment.</p>'+
 '<form class="form" id="checkout-form">'+
 '<div class="field"><label for="order-method">Fulfillment</label><select id="order-method" name="method">'+
 (shop.offers_pickup?'<option value="pickup" '+(state.method==='pickup'?'selected':'')+'>Pickup at shop</option>':'')+
 (shop.offers_delivery?'<option value="delivery" '+(state.method==='delivery'?'selected':'')+'>Shop delivery · '+money(shop.delivery_fee_cents)+'</option>':'')+
 '</select></div>'+
 '<div class="field"><label for="order-phone">Contact phone</label><input id="order-phone" name="phone" type="tel" required minlength="7" maxlength="30" autocomplete="tel" placeholder="09XXXXXXXXX"></div>'+
 '<div class="field" id="address-field" '+(state.method==='delivery'?'':'hidden')+'><label for="order-address">Delivery address</label>'+
 '<textarea id="order-address" name="address" minlength="8" placeholder="Street, barangay, landmark"></textarea></div>'+
 '<div class="field"><label for="order-note">Order notes (optional)</label><textarea id="order-note" name="note" maxlength="500" rows="2"></textarea></div>'+
 '<div class="list-row"><span>Items</span><strong>'+money(lines.reduce((sum,x)=>sum+x.item.price_cents*x.qty,0))+'</strong></div>'+
 '<div class="list-row"><span>Shop delivery</span><strong>'+(state.method==='delivery'?money(shop.delivery_fee_cents):'—')+'</strong></div>'+
 '<div class="list-row"><strong>Total</strong><strong>'+money(cartTotal())+'</strong></div>'+
 '<p class="checkout-note">'+(state.method==='delivery'?'Pay the shop directly when it delivers.':'Pay the shop directly when you pick up.')+
 ' Tabo does not process payments or dispatch riders.</p>'+
 (state.user?'<button class="btn primary block" type="submit" '+(state.busy?'disabled':'')+'>Place order</button>':
 '<button class="btn primary block" type="button" data-action="signin">Continue with Google to order</button>')+
 '</form></section></div>';
}
function statusPill(value){return '<span class="pill '+(['approved','completed','accepted'].includes(value)?'green':
 ['pending','placed','preparing'].includes(value)?'yellow':'')+'">'+esc(value.replaceAll('_',' '))+'</span>'}
function ordersHtml(orders, seller=false){
 return orders.length?orders.map(o=>'<div class="list-row"><div><strong>Order '+esc(o.id.slice(0,8))+'</strong>'+
 '<div class="small muted">'+esc(o.shops?.name||'Shop')+' · '+(o.method==='pickup'?'Pickup':'Shop delivery')+
 ' · '+new Date(o.created_at).toLocaleString()+'</div>'+
 '<div class="small muted">'+(o.order_items||[]).map(i=>esc(i.quantity+' × '+i.item_name)).join(', ')+'</div>'+
 '<div class="price">'+money(o.total_cents)+'</div></div><div class="actions">'+statusPill(o.status)+
 (seller?nextStatus(o).map(s=>'<button class="btn sm" data-action="advance" data-id="'+esc(o.id)+'" data-status="'+s+'">'+
 (s==='rejected'?'Reject':s.replaceAll('_',' '))+'</button>').join(''):'')+'</div></div>').join(''):
 noteEmpty('No orders yet',seller?'Customer orders for your shop appear here.':'Your orders will appear after you check out.');
}
function renderOrders(){
 if(!state.user){root.innerHTML=noteEmpty('Sign in to view orders','Use your Google account to continue.','<button class="btn primary" data-action="signin">Sign in with Google</button>');return}
 root.innerHTML='<h1>My orders</h1><div class="panel">'+ordersHtml(state.orders)+'</div>';
}
function renderSeller(){
 if(!state.user){root.innerHTML=noteEmpty('Seller sign in','Sign in with Google to apply for a shop.','<button class="btn primary" data-action="signin">Sign in with Google</button>');return}
 if(!state.shop){
  root.innerHTML='<h1>Become a seller</h1><p class="muted">Shops manage their own menus, pickup, and delivery. An admin reviews each application.</p>'+
  '<div class="panel"><form class="form" id="shop-apply-form"><div class="field"><label for="apply-name">Shop name</label>'+
  '<input id="apply-name" name="name" required minlength="2" maxlength="100"></div>'+
  '<div class="field"><label for="apply-desc">Description</label><textarea name="description" id="apply-desc"></textarea></div>'+
  '<label class="checklabel"><input type="checkbox" name="pickup" checked>Offers pickup</label>'+
  '<label class="checklabel"><input type="checkbox" name="delivery">Offers shop delivery</label>'+
  '<div class="field"><label for="apply-fee">Delivery fee (₱)</label><input id="apply-fee" name="fee" type="number" min="0" step=".01" value="0"></div>'+
  '<button class="btn primary" type="submit">Submit application</button></form></div>';
  return;
 }
 const s=state.shop;
 root.innerHTML='<div class="panel-head"><div><h1>'+esc(s.name)+'</h1><p class="small muted">Seller workspace · '+statusPill(s.status)+'</p></div></div>'+
 (s.status!=='approved'?'<div class="checkout-note">Your shop needs admin approval before customers can order.</div>':'')+
 '<div class="two section"><section class="panel"><h2>Shop settings</h2><form id="shop-settings-form" class="form">'+
 '<div class="field"><label for="seller-name">Shop name</label><input id="seller-name" name="name" value="'+esc(s.name)+'" required minlength="2"></div>'+
 '<div class="field"><label for="seller-description">Description</label><textarea id="seller-description" name="description">'+esc(s.description)+'</textarea></div>'+
 '<label class="checklabel"><input type="checkbox" name="is_open" '+(s.is_open?'checked':'')+'>Accept orders</label>'+
 '<label class="checklabel"><input type="checkbox" name="pickup" '+(s.offers_pickup?'checked':'')+'>Pickup available</label>'+
 '<label class="checklabel"><input type="checkbox" name="delivery" '+(s.offers_delivery?'checked':'')+'>Shop delivery available</label>'+
 '<div class="field"><label for="seller-fee">Shop delivery fee (₱)</label><input id="seller-fee" name="fee" type="number" min="0" max="10000" step=".01" value="'+(s.delivery_fee_cents/100).toFixed(2)+'"></div>'+
 '<button class="btn primary" type="submit">Save settings</button></form></section>'+
 '<section class="panel"><h2>Add menu item</h2><form class="form" id="add-item-form">'+
 '<div class="field"><label for="add-name">Item name</label><input id="add-name" name="name" required maxlength="120"></div>'+
 '<div class="field"><label for="add-price">Price (₱)</label><input id="add-price" name="price" type="number" min=".01" max="1000000" step=".01" required></div>'+
 '<div class="field"><label for="add-image">Image URL (optional, HTTPS only)</label><input id="add-image" name="image" type="url" placeholder="https://"></div>'+
 '<div class="field"><label for="add-desc">Description</label><textarea id="add-desc" name="description"></textarea></div>'+
 '<button class="btn primary" type="submit">Add item</button></form></section></div>'+
 '<div class="panel"><div class="panel-head"><h2>Menu</h2><span class="small muted">'+state.sellerItems.length+' items</span></div>'+
 (state.sellerItems.length?state.sellerItems.map(i=>'<div class="list-row"><div><strong>'+esc(i.name)+'</strong>'+
 '<div class="small muted">'+money(i.price_cents)+' · '+(i.is_available?'Available':'Unavailable')+'</div></div>'+
 '<div class="actions"><button class="btn sm" data-action="edit-item" data-id="'+esc(i.id)+'">Edit</button>'+
 '<button class="btn sm" data-action="availability" data-id="'+esc(i.id)+'">'+(i.is_available?'Mark unavailable':'Make available')+'</button></div></div>').join(''):
 noteEmpty('No menu items','Use the form above to add your first dish.'))+'</div>'+
 '<div class="panel"><h2>Incoming orders</h2>'+ordersHtml(state.sellerOrders,true)+'</div>';
}
function renderAdmin(){
 if(!state.user||!state.role.is_admin){root.innerHTML=noteEmpty('Restricted workspace','Your Google account is not a Tabo platform administrator.');return}
 root.innerHTML='<h1>Platform admin</h1><p class="muted">Approve shops and monitor orders. Sellers remain responsible for fulfillment.</p>'+
 '<section class="panel"><div class="panel-head"><h2>Shop applications and status</h2><span class="small muted">'+state.adminShops.length+' shops</span></div>'+
 (state.adminShops.length?state.adminShops.map(s=>'<div class="list-row"><div><strong>'+esc(s.name)+'</strong>'+
 '<span class="small muted">'+esc(s.description||'No description')+'</span></div><div class="actions">'+statusPill(s.status)+
 (s.status!=='approved'?'<button class="btn sm" data-action="review" data-id="'+esc(s.id)+'" data-status="approved">Approve</button>':'')+
 (s.status!=='rejected'?'<button class="btn sm danger" data-action="review" data-id="'+esc(s.id)+'" data-status="rejected">Reject</button>':'')+
 '</div></div>').join(''):noteEmpty('No shop applications','Seller applications appear here.'))+'</section>'+
 '<section class="panel"><h2>Order monitoring</h2>'+ordersHtml(state.adminOrders)+'</section>';
}
function render(){
 paintNav();
 if(state.view==='home')renderHome();
 else if(state.view==='shop')renderShop();
 else if(state.view==='product')renderProduct();
 else if(state.view==='cart')renderCart();
 else if(state.view==='orders')renderOrders();
 else if(state.view==='seller')renderSeller();
 else if(state.view==='admin')renderAdmin();
 updateCartBar();
}
async function refreshCatalog(){
 const [shops,items]=await Promise.all([
  sb.from('shops').select('id,name,description,is_open,offers_pickup,offers_delivery,delivery_fee_cents').eq('status','approved').eq('is_open',true).order('created_at',{ascending:false}),
  sb.from('menu_items').select('id,shop_id,name,description,image_url,price_cents,is_available').eq('is_available',true).order('created_at',{ascending:false})
 ]);
 if(shops.error)throw shops.error;
 if(items.error)throw items.error;
 state.shops=shops.data||[];
 state.items=(items.data||[]).filter(i=>state.shops.some(s=>s.id===i.shop_id));
 if(state.cart.length&&!currentShopForCart()) {state.cart=[];saveCart();}
}
async function refreshAccess(){
 if(!state.user){state.role={is_admin:false,shop_id:null};state.shop=null;return}
 const {data,error}=await sb.rpc('my_access');
 if(error)throw error;
 state.role=data||{is_admin:false,shop_id:null};
 const r=await sb.from('shops').select('*').eq('owner_id',state.user.id).maybeSingle();
 if(r.error)throw r.error;
 state.shop=r.data;
}
async function refreshViewData(){
 if(state.view==='seller'&&state.shop){
  const [items,orders]=await Promise.all([
   sb.from('menu_items').select('*').eq('shop_id',state.shop.id).order('created_at',{ascending:false}),
   sb.from('orders').select('id,shop_id,method,status,total_cents,created_at,shops(name),order_items(item_name,quantity)').eq('shop_id',state.shop.id).order('created_at',{ascending:false}).limit(100)
  ]);
  if(items.error)throw items.error;if(orders.error)throw orders.error;
  state.sellerItems=items.data||[];state.sellerOrders=orders.data||[];
 }
 if(state.view==='orders'&&state.user){
  const r=await sb.from('orders').select('id,shop_id,method,status,total_cents,created_at,shops(name),order_items(item_name,quantity)').eq('buyer_id',state.user.id).order('created_at',{ascending:false}).limit(100);
  if(r.error)throw r.error;state.orders=r.data||[];
 }
 if(state.view==='admin'&&state.role.is_admin){
  const [shops,orders]=await Promise.all([
   sb.from('shops').select('*').order('created_at',{ascending:false}),
   sb.from('orders').select('id,shop_id,method,status,total_cents,created_at,shops(name),order_items(item_name,quantity)').order('created_at',{ascending:false}).limit(100)
  ]);
  if(shops.error)throw shops.error;if(orders.error)throw orders.error;
  state.adminShops=shops.data||[];state.adminOrders=orders.data||[];
 }
}
async function navigate(view){
 state.view=view;location.hash=view;
 try{await refreshViewData()}catch(e){flash(e.message||'Unable to load this page')}
 render();window.scrollTo(0,0);
}
async function refreshAuth(){
 try{
  const {data:{user},error}=await sb.auth.getUser();
  if(error&&!/missing auth session/i.test(error.message))throw error;
  state.user=user||null;
  await Promise.all([refreshCatalog(),refreshAccess()]);
  await refreshViewData();
  render();
 }catch(e){flash(e.message||'Unable to load Tabo');render();}
}
async function signIn(){
 sessionStorage.setItem('tabo-after-login',state.view);
 const redirectTo=location.origin+location.pathname;
 const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo}});
 if(error)flash('Google sign-in unavailable: '+error.message);
}
async function signOut(){
 const {error}=await sb.auth.signOut();
 if(error){flash(error.message);return}
 state.user=null;state.role={is_admin:false};state.shop=null;state.cart=[];saveCart();
 await navigate('home');
}
async function addToCart(id){
 const item=findItem(id),shop=item&&findShop(item.shop_id);
 if(!item||!shop)return;
 if(state.cart.length&&state.cart[0].shop_id!==shop.id){
  if(!confirm('Start a new order from '+shop.name+'? Your current cart will be cleared.'))return;
  state.cart=[];
 }
 const row=state.cart.find(x=>x.id===id);
 if(row)row.qty=Math.min(25,row.qty+1);
 else state.cart.push({id,shop_id:shop.id,qty:1});
 if(!shop.offers_pickup)state.method='delivery';
 saveCart();flash('Added to cart');render();
}
async function submitOrder(form){
 if(!state.user){await signIn();return}
 const shop=currentShopForCart();if(!shop)return;
 const fd=new FormData(form);
 const method=fd.get('method');
 const phone=String(fd.get('phone')||'').trim();
 const address=String(fd.get('address')||'').trim();
 const note=String(fd.get('note')||'').trim();
 if(method==='delivery'&&address.length<8){flash('Enter a complete delivery address.');return}
 if(phone.length<7){flash('Enter a valid contact phone number.');return}
 const requestId=state.requestId||(state.requestId=crypto.randomUUID());
 state.busy=true;render(); // do not re-read form after re-render
 const {data,error}=await sb.rpc('place_order',{
  p_shop_id:shop.id,p_method:method,p_items:cartLines().map(x=>({id:x.item.id,quantity:x.qty})),
  p_phone:phone,p_delivery_address:method==='delivery'?address:null,p_note:note,p_request_id:requestId
 });
 state.busy=false;
 if(error){flash(error.message);render();return}
 state.cart=[];saveCart();state.requestId=null;
 flash('Order '+String(data).slice(0,8)+' placed successfully.');
 await navigate('orders');
}
function pesosToCents(value){
 const n=Number(value);
 if(!Number.isFinite(n)||n<0)return null;
 return Math.round(n*100);
}
async function mutate(fn,success,after=()=>navigate(state.view)){
 if(state.busy)return;
 state.busy=true;
 try {await fn();flash(success);await refreshCatalog();await refreshAccess();await after()}
 catch(e){flash(e.message||'Action failed');render()}
 finally {state.busy=false}
}
document.querySelector('#search-toggle').addEventListener('click',()=>{
 const p=document.querySelector('#search-panel');p.hidden=!p.hidden;if(!p.hidden)document.querySelector('#search-field').focus();
});
document.querySelector('#search-field').addEventListener('input',event=>{
 state.search=event.target.value;if(state.view!=='home')state.view='home';render();
});
document.querySelector('#orders-toggle').addEventListener('click',()=>navigate('orders'));
document.querySelector('.wordmark').addEventListener('click',e=>{e.preventDefault();navigate('home')});
cartBar.addEventListener('click',()=>navigate('cart'));
document.addEventListener('click',async event=>{
 const el=event.target.closest('[data-action]');if(!el)return;
 const a=el.dataset.action,id=el.dataset.id;
 try{
  if(a==='navigate')await navigate(el.dataset.view);
  if(a==='signin')await signIn();
  if(a==='signout')await signOut();
  if(a==='shop'){state.selectedShop=id;await navigate('shop')}
  if(a==='item'){state.selectedItem=id;await navigate('product')}
  if(a==='add')await addToCart(id);
  if(a==='qty'){const x=state.cart.find(x=>x.id===id);if(x){x.qty+=Number(el.dataset.change);if(x.qty<=0)state.cart=state.cart.filter(x=>x.id!==id);saveCart();render()}}
  if(a==='review')await mutate(async()=>{
   const r=await sb.rpc('review_shop',{p_shop_id:id,p_status:el.dataset.status});if(r.error)throw r.error;
  },'Shop updated');
  if(a==='advance')await mutate(async()=>{
   const r=await sb.rpc('change_order_status',{p_order_id:id,p_status:el.dataset.status});if(r.error)throw r.error;
  },'Order status updated');
  if(a==='availability')await mutate(async()=>{
   const m=state.sellerItems.find(x=>x.id===id);
   const r=await sb.from('menu_items').update({is_available:!m.is_available}).eq('id',id);if(r.error)throw r.error;
  },'Item availability updated');
  if(a==='edit-item'){
   const m=state.sellerItems.find(x=>x.id===id);if(!m)return;
   const name=prompt('Item name',m.name);if(name===null)return;
   const rawPrice=prompt('Price (₱)',String(m.price_cents/100));if(rawPrice===null)return;
   const price=pesosToCents(rawPrice);if(!name.trim()||!price||price>100000000){flash('Enter a valid item name and price');return}
   await mutate(async()=>{const r=await sb.from('menu_items').update({name:name.trim(),price_cents:price}).eq('id',id);if(r.error)throw r.error},'Menu item updated');
  }
 }catch(e){flash(e.message||'Action failed')}
});
document.addEventListener('change',event=>{
 if(event.target.id==='order-method'){
  state.method=event.target.value;
  const ad=document.querySelector('#address-field');if(ad)ad.hidden=state.method!=='delivery';
  const shop=currentShopForCart();
  const cartPrice=document.querySelector('#checkout-form .price');
  if(shop){const inputs=Object.fromEntries(new FormData(document.querySelector('#checkout-form')).entries());
   renderCart();for(const [k,v] of Object.entries(inputs)){const f=document.querySelector('#checkout-form [name="'+k+'"]');if(f&&k!=='method')f.value=v}}
 }
});
document.addEventListener('submit',async event=>{
 const form=event.target;
 if(!['checkout-form','shop-apply-form','shop-settings-form','add-item-form'].includes(form.id))return;
 event.preventDefault();
 if(form.id==='checkout-form'){await submitOrder(form);return}
 const fd=new FormData(form);
 if(form.id==='shop-apply-form'){
  const pickup=fd.has('pickup'),delivery=fd.has('delivery'),fee=pesosToCents(fd.get('fee'));
  if(!pickup&&!delivery){flash('Offer pickup or delivery');return}
  if(fee===null||fee>1000000){flash('Invalid delivery fee');return}
  await mutate(async()=>{
   const r=await sb.from('shops').insert({owner_id:state.user.id,name:String(fd.get('name')).trim(),
    description:String(fd.get('description')||''),offers_pickup:pickup,offers_delivery:delivery,delivery_fee_cents:fee});
   if(r.error)throw r.error;
  },'Shop application submitted');
 }
 if(form.id==='shop-settings-form'){
  const pickup=fd.has('pickup'),delivery=fd.has('delivery'),fee=pesosToCents(fd.get('fee'));
  if(!pickup&&!delivery||fee===null||fee>1000000){flash('Check fulfillment options and fee');return}
  await mutate(async()=>{
   const r=await sb.rpc('update_shop_settings',{p_shop_id:state.shop.id,p_name:String(fd.get('name')).trim(),
   p_description:String(fd.get('description')||''),p_is_open:fd.has('is_open'),p_pickup:pickup,
   p_delivery:delivery,p_delivery_fee_cents:fee});if(r.error)throw r.error;
  },'Shop settings saved');
 }
 if(form.id==='add-item-form'){
  const price=pesosToCents(fd.get('price')),image=String(fd.get('image')||'').trim();
  if(!price||price>100000000){flash('Enter a valid price');return}
  if(image&&!/^https:\/\//i.test(image)){flash('Image URL must begin with https://');return}
  await mutate(async()=>{
   const r=await sb.from('menu_items').insert({shop_id:state.shop.id,name:String(fd.get('name')).trim(),
   description:String(fd.get('description')||''),image_url:image||null,price_cents:price,is_available:true});
   if(r.error)throw r.error;
  },'Menu item added');
 }
});
sb.auth.onAuthStateChange((event)=>{
 if(event==='SIGNED_IN'||event==='SIGNED_OUT'||event==='TOKEN_REFRESHED')setTimeout(async()=>{
  const next=sessionStorage.getItem('tabo-after-login');
  if(event==='SIGNED_IN'&&next){sessionStorage.removeItem('tabo-after-login');state.view=next}
  await refreshAuth();
 },0);
});
await refreshAuth();
