import {ApiProblem,parseBody,requireOwner,sendJson,supabase} from './supabase-server.mjs';
export async function siteContent(req,res){
 if(!['GET','POST'].includes(req.method))throw new ApiProblem('Method not allowed.',405);
 const {accessToken}=await requireOwner(req,res,{mutation:req.method==='POST'});
 if(req.method==='GET')return sendJson(res,200,await supabase('/rest/v1/rpc/oreva_read_content',{method:'POST',accessToken,body:{}}));
 const data=parseBody(req),content={};
 for(const key of ['about','shipping','returns','privacy','support_email']){
  const value=data[key];if(typeof value!=='string'||value.length>(key==='support_email'?254:10000))throw new ApiProblem('Invalid '+key+' text.');content[key]=value.trim();
 }
 if(content.support_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.support_email))throw new ApiProblem('Enter a valid support email.');
 await supabase('/rest/v1/rpc/oreva_save_content',{method:'POST',accessToken,body:{content}});
 sendJson(res,200,{ok:true});
}
