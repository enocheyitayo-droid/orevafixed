self.addEventListener('push',event=>{let data={};try{data=event.data.json();}catch{}event.waitUntil(self.registration.showNotification('Store update',{body:'An order needs your attention. Open your dashboard.',tag:data.tag||'store-update',data:{url:'/admin'}}));});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.openWindow('/admin'));});
