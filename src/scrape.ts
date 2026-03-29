import { KidsAZScraper } from './scraper';
import * as path from 'path';

async function main() {
  const scraper = new KidsAZScraper({
    cookiesPath: path.join(process.cwd(), 'cookies.json'),
    outputDir: path.join(process.cwd(), 'data'),
    startUrl: 'https://www.kidsa-z.com/main/ReadingBookRoom#!/collectionId/1?level=L',
    headless: false
  });

  try {
    await scraper.initialize();
    await scraper.scrapeAllBooks();
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await scraper.close();
  }
}

main();
