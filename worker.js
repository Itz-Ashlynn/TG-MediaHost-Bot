
const BOT_TOKEN = ''; // Set your tg bot token
const AR_HOSTING_API = 'https://ar-hosting.pages.dev/upload';
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const START_TEXT = (username) => `Hello ${username},
I am a media/file uploader bot (up to 20MB) that uploads to AR Hosting.

Maintained by @Ashlynn_Repository`;

const ST_TEXT = `--**START**--

- I am a media/file uploader bot (up to 20MB) that uploads to AR Hosting
- I'll upload it to AR Hosting and give you the direct URL
- Supported formats: Images (JPG, PNG, GIF), Videos (MP4, MOV), Documents (PDF, etc.)
- Maintained by [Ashlynn Repository](https://t.me/Ashlynn_Repository)`;

const HELP_TEXT = `--**Help**--

- Send me any media file under 20MB
- I'll upload it to AR Hosting and give you the direct URL
- Supported formats: Images (JPG, PNG, GIF), Videos (MP4, MOV), Documents (PDF, etc.)
- Max file size: 20MB`;

const ABOUT_TEXT = `--**About Me**--

- **Bot**: \`AR Hosting Uploader\`
- **Maintainer**: [Ashlynn Repository](https://t.me/Ashlynn_Repository)
- **Hosting**: [AR Hosting](https://ar-hosting.pages.dev)
- **Platform**: [Cloudflare Workers](https://workers.cloudflare.com)
- **Max File Size**: 20MB`;

// Button layouts
const START_BUTTONS = {
    inline_keyboard: [
        [{ text: 'Contact', url: 'https://t.me/Ashlynn_Repository' }],
        [
            { text: 'Help', callback_data: 'help' },
            { text: 'About', callback_data: 'about' },
            { text: 'Close', callback_data: 'close' }
        ]
    ]
};

const HELP_BUTTONS = {
    inline_keyboard: [
        [
            { text: 'Home', callback_data: 'home' },
            { text: 'About', callback_data: 'about' },
            { text: 'Close', callback_data: 'close' }
        ]
    ]
};

const ABOUT_BUTTONS = {
    inline_keyboard: [
        [
            { text: 'Home', callback_data: 'home' },
            { text: 'Help', callback_data: 'help' },
            { text: 'Close', callback_data: 'close' }
        ]
    ]
};

async function callTelegramAPI(method, body) {
    const response = await fetch(`${BASE_URL}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return response.json();
}

async function uploadToARHosting(fileBuffer, fileName) {
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), fileName);
    
    const response = await fetch(AR_HOSTING_API, {
        method: 'POST',
        headers: {
            'Accept': '*/*',
            'Origin': 'https://ar-hosting.pages.dev',
            'Referer': 'https://ar-hosting.pages.dev/',
            'User-Agent': 'Cloudflare Worker Telegram Bot'
        },
        body: formData
    });
    
    if (!response.ok) {
        throw new Error(`AR Hosting responded with status ${response.status}`);
    }
    
    const result = await response.json();
    
    if (!result?.data) {
        throw new Error(result?.error || 'Upload failed - no data received');
    }
    
    return result.data;
}

// Handle incoming updates
async function handleUpdate(update) {
    if (update.callback_query) {
        const cb = update.callback_query;
        
        let text, reply_markup;
        switch (cb.data) {
            case 'home':
                text = ST_TEXT;
                reply_markup = START_BUTTONS;
                break;
            case 'help':
                text = HELP_TEXT;
                reply_markup = HELP_BUTTONS;
                break;
            case 'about':
                text = ABOUT_TEXT;
                reply_markup = ABOUT_BUTTONS;
                break;
            case 'close':
                await callTelegramAPI('deleteMessage', {
                    chat_id: cb.message.chat.id,
                    message_id: cb.message.message_id
                });
                return;
            default:
                await callTelegramAPI('answerCallbackQuery', {
                    callback_query_id: cb.id,
                    text: 'Unknown command'
                });
                return;
        }
        
        await callTelegramAPI('editMessageText', {
            chat_id: cb.message.chat.id,
            message_id: cb.message.message_id,
            text: text,
            reply_markup: reply_markup,
            disable_web_page_preview: true,
            parse_mode: 'Markdown'
        });
        
        await callTelegramAPI('answerCallbackQuery', {
            callback_query_id: cb.id
        });
        return;
    }
    
    if (update.message) {
        const message = update.message;

        if (message.text && message.text.startsWith('/start')) {
            await callTelegramAPI('sendMessage', {
                chat_id: message.chat.id,
                text: START_TEXT(message.from.first_name),
                reply_markup: START_BUTTONS,
                disable_web_page_preview: true
            });
            return;
        }
        
        if (message.photo || message.video || message.document || message.animation) {
            let fileId, fileSize, fileName;
            
            if (message.photo) {
                const largestPhoto = message.photo.reduce((prev, current) => 
                    (prev.file_size > current.file_size) ? prev : current
                );
                fileId = largestPhoto.file_id;
                fileSize = largestPhoto.file_size;
                fileName = `photo_${Date.now()}.jpg`;
            } 
            else if (message.video) {
                fileId = message.video.file_id;
                fileSize = message.video.file_size;
                fileName = message.video.file_name || `video_${Date.now()}.mp4`;
            } 
            else if (message.document) {
                fileId = message.document.file_id;
                fileSize = message.document.file_size;
                fileName = message.document.file_name || `file_${Date.now()}`;
            } 
            else if (message.animation) {
                fileId = message.animation.file_id;
                fileSize = message.animation.file_size;
                fileName = `animation_${Date.now()}.gif`;
            }

            if (fileSize > MAX_FILE_SIZE) {
                await callTelegramAPI('sendMessage', {
                    chat_id: message.chat.id,
                    text: `❌ File is too large (${(fileSize / 1024 / 1024).toFixed(2)}MB). Max size is 20MB.`,
                    reply_to_message_id: message.message_id
                });
                return;
            }
            
            const processingMsg = await callTelegramAPI('sendMessage', {
                chat_id: message.chat.id,
                text: '⏳ Processing your file...',
                reply_to_message_id: message.message_id
            });
            
            try {
                const fileInfo = await callTelegramAPI('getFile', { file_id: fileId });
                const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.result.file_path}`;
                
                const fileResponse = await fetch(fileUrl);
                const fileBuffer = await fileResponse.arrayBuffer();

                const hostedUrl = await uploadToARHosting(fileBuffer, fileName);
                
                const shareUrl = `https://telegram.me/share/url?url=${encodeURIComponent(hostedUrl)}`;
                
                const resultButtons = {
                    inline_keyboard: [
                        [
                            { text: 'Open Link', url: hostedUrl },
                            { text: 'Share Link', url: shareUrl }
                        ],
                        [
                            { text: 'Contact', url: 'https://t.me/Ashlynn_Repository' }
                        ]
                    ]
                };
                
                await callTelegramAPI('editMessageText', {
                    chat_id: message.chat.id,
                    message_id: processingMsg.result.message_id,
                    text: `✅ File uploaded successfully!\n\n𝗗𝗶𝗿𝗲𝗰𝘁 𝗨𝗥𝗟: ${hostedUrl}\n\nMaintained by @Ashlynn_Repository`,
                    reply_markup: resultButtons,
                    disable_web_page_preview: true
                });
                
            } catch (error) {
                console.error('Upload error:', error);
                
                await callTelegramAPI('editMessageText', {
                    chat_id: message.chat.id,
                    message_id: processingMsg.result.message_id,
                    text: `❌ Upload failed: ${error.message}\n\nTry again or contact @Ashlynn_Repository for help.`,
                    disable_web_page_preview: true
                });
            }
        }
    }
}

export default {
    async fetch(request, env) {
        if (request.method === 'POST') {
            try {
                const update = await request.json();
                await handleUpdate(update);
                return new Response('OK', { status: 200 });
            } catch (error) {
                console.error('Error handling update:', error);
                return new Response('Error', { status: 500 });
            }
        }
        
        return new Response('Method not allowed', { status: 405 });
    }
};
