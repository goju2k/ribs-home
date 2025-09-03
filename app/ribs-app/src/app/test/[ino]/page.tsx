import { permanentRedirect, RedirectType } from 'next/navigation';

export default async function FriendEventPage({ params }:{params:{ino:string;};}) {

  const targetUrl = `https://d3vgce7md3dv5f.cloudfront.net/event/sample3.html?ino=${params.ino}`;
  permanentRedirect(targetUrl, RedirectType.replace);
  
}
