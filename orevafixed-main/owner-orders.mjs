import {ApiProblem, parseBody, requireOwner, sendJson, supabaseService} from './supabase-server.mjs';
export async function ownerOrders(req,res) {
  if(!['GET','POST'].includes(req.method)) throw new ApiProblem('Method not allowed.',405);
  await requireOwner(req,res,{mutation:req.method==='POST'});
  if(req.method==='GET') {
    const orders=await supabaseService('/rest/v1/bagz_orders?select=id,number,token,name,email,phone,address,method,total,payment_status,fulfilment,allocated,exception,created_at&order=created_at.desc&limit=100');
    return sendJson(res,200,{orders});
  }
  const {id,state}=parseBody(req);
  if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))throw new ApiProblem('Invalid order.');
  const rows=await supabaseService('/rest/v1/bagz_orders?id=eq.'+encodeURIComponent(id)+'&select=id,method,payment_status,fulfilment,allocated,exception,refunded');
  const order=rows?.[0];if(!order)throw new ApiProblem('Order not found.',404);
  const stages=['Paid','Preparing',order.method==='pickup'?'Ready for pickup':'Out for delivery','Completed'];
  if(order.payment_status!=='paid'||order.refunded>0||!order.allocated||order.exception||stages.indexOf(order.fulfilment)<0||stages[stages.indexOf(order.fulfilment)+1]!==state)throw new ApiProblem('This order cannot move to that stage. Refresh and check its payment and stock status.',409);
  const updated=await supabaseService('/rest/v1/bagz_orders?id=eq.'+encodeURIComponent(id)+'&payment_status=eq.paid&allocated=eq.true&refunded=eq.0&fulfilment=eq.'+encodeURIComponent(order.fulfilment),{method:'PATCH',headers:{Prefer:'return=representation'},body:{fulfilment:state}});
  if(!updated?.length)throw new ApiProblem('This order changed. Refresh before trying again.',409);
  sendJson(res,200,{ok:true});
}
