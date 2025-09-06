import { Metadata } from 'next';
import { permanentRedirect, RedirectType } from 'next/navigation';

export async function generateMetadata({ params }:{params:{ino:string;};}):Promise<Metadata> {
  
  const title = 'KB부동산 친구초대 이벤트';
  const description = '&#9660;KB부동산 신규가입 시 커피쿠폰&#9660;';

  const url = `https://d3vgce7md3dv5f.cloudfront.net/event/sample3.html?ino=${params.ino}`;
  const imageUrl = 'https://d3vgce7md3dv5f.cloudfront.net/event/invite-friend/invite-friend-card.png';

  return {
    openGraph: {
      title,
      description,
      url,
      images: [
        imageUrl,
      ],
    },
  };
}

export default async function FriendEventPage({ params }:{params:{ino:string;};}) {

  const targetUrl = `https://d3vgce7md3dv5f.cloudfront.net/event/sample3.html?ino=${params.ino}`;
  permanentRedirect(targetUrl, RedirectType.replace);
  
}
