const https = require('https');
const fs = require('fs');
const path = require('path');

const FONTS_DIR = path.join(__dirname, '../public/fonts');
if (!fs.existsSync(FONTS_DIR)) {
  fs.mkdirSync(FONTS_DIR, { recursive: true });
}

const url = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap";

const options = {
  headers: {
    // Lie about user agent to get woff2 instead of ttf
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.85 Safari/537.36'
  }
};

https.get(url, options, (res) => {
  let cssData = '';
  res.on('data', chunk => cssData += chunk);
  res.on('end', () => {
    // Find all urls in the CSS
    const urlRegex = /url\((https:\/\/[^)]+)\)/g;
    let match;
    let downloadedFonts = new Set();
    
    // Replace and download
    let localCssData = cssData;
    let requests = [];

    while ((match = urlRegex.exec(cssData)) !== null) {
      const fontUrl = match[1];
      const fontFilename = fontUrl.split('/').pop();
      const localFontPath = path.join(FONTS_DIR, fontFilename);
      const relativeFontPath = `/fonts/${fontFilename}`;
      
      localCssData = localCssData.replace(fontUrl, relativeFontPath);
      
      if (!downloadedFonts.has(fontUrl)) {
        downloadedFonts.add(fontUrl);
        requests.push(new Promise((resolve, reject) => {
          https.get(fontUrl, (fontRes) => {
            const fontStream = fs.createWriteStream(localFontPath);
            fontRes.pipe(fontStream);
            fontStream.on('finish', () => resolve());
            fontStream.on('error', reject);
          }).on('error', reject);
        }));
      }
    }

    Promise.all(requests).then(() => {
      fs.writeFileSync(path.join(__dirname, '../src/fonts.css'), localCssData);
      console.log('Fonts downloaded and fonts.css generated.');
    }).catch(err => {
      console.error('Error downloading fonts', err);
    });
  });
}).on('error', (err) => {
  console.error("Error fetching CSS:", err);
});
