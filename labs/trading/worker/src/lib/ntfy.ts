import axios from 'axios';

export async function sendNtfyMessage(title: string, message: string) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;

  try {
    await axios.post(`https://ntfy.sh/${topic}`, message, {
      headers: {
        'Title': title,
        'Click': 'https://autotradev.duckdns.org/mobile/',
        'Tags': 'warning,chart_with_upwards_trend'
      }
    });
  } catch (error: any) {
    console.warn('[ntfy] 알림 전송 실패:', error.message);
  }
}
