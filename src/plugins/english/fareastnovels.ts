import { fetchText } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { isUrlAbsolute } from '@libs/isAbsoluteUrl';

class FEN implements Plugin.PluginBase {
  id = 'FEN';
  name = 'FarEastNovels';
  icon = 'src/en/fareastnovels/icon.png';
  site = 'https://fareastnovels.com';
  version = '1.0.0';
  filters = undefined;
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  //flag indicates whether access to LocalStorage, SesesionStorage is required.
  webStorageUtilized?: true;

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];

    try {
      // Fetch the library page to get all novels
      const result = await fetchText(`${this.site}/library`);
      const $ = loadCheerio(result);

      // Parse all novels from the library grid
      $('.library-grid .carousel-item').each((index, element) => {
        const novelElement = $(element);

        // Extract novel information
        const name = novelElement.find('.carousel-item-title').text().trim();
        const path = novelElement.attr('href');
        const cover = novelElement.find('img').attr('src');

        novels.push({
          name: name,
          path: path || '',
          cover: cover && isUrlAbsolute(cover) ? cover : `${this.site}${cover}`,
        });
      });

      // For pagination, we can split results into pages
      // Each page shows 20 novels
      const itemsPerPage = 20;
      const startIndex = (pageNo - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;

      return novels.slice(startIndex, endIndex);
    } catch (error) {
      console.error('Error fetching popular novels:', error);
      return [];
    }
  }
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Untitled',
    };

    try {
      const result = await fetchText(this.site + novelPath);
      const $ = loadCheerio(result);

      // Extract novel details from the novel-details div
      const novelDetails = $('.novel-details');

      // Get novel name from h2 tag
      novel.name = novelDetails.find('h2').text().trim();

      // Get author from the Author paragraph
      novel.author = novelDetails
        .find('p')
        .filter((_, el) => $(el).text().includes('Author:'))
        .text()
        .replace('Author:', '')
        .trim();

      // Get status
      const statusText = novelDetails
        .find('p')
        .filter((_, el) => $(el).text().includes('Status:'))
        .text()
        .replace('Status:', '')
        .trim();
      novel.status =
        statusText.toLowerCase() === 'completed'
          ? NovelStatus.Completed
          : NovelStatus.Unknown;

      // Get cover image
      const coverImg = novelDetails.find('img').attr('src');
      if (coverImg) {
        novel.cover = isUrlAbsolute(coverImg)
          ? coverImg
          : `${this.site}${coverImg}`;
      } else {
        novel.cover = defaultCover;
      }

      // Get description
      const descriptionDiv = novelDetails.find('.description');
      if (descriptionDiv.length > 0) {
        // Remove <br> tags and get text content
        novel.summary =
          descriptionDiv
            .html()
            ?.replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]*>/g, '')
            .trim() || '';
      }

      const chapters: Plugin.ChapterItem[] = [];

      // Parse chapter list from the chapters div
      $('.chapters .chapter-item').each((index, element) => {
        const chapterElement = $(element);
        const link = chapterElement.find('a');

        if (link.length > 0) {
          const chapterPath = link.attr('href') || '';
          const chapterName = link.text().trim();

          // Extract chapter number from the name or use index + 1
          let chapterNumber = index + 1;
          const chapterMatch = chapterName.match(/Chapter\s+(\d+)/i);
          if (chapterMatch) {
            chapterNumber = parseInt(chapterMatch[1], 10);
          }

          chapters.push({
            name: chapterName,
            path: chapterPath,
            releaseTime: '',
            chapterNumber: chapterNumber,
          });
        }
      });

      novel.chapters = chapters;
    } catch (error) {
      console.error('Error parsing novel:', error);
    }

    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    try {
      const result = await fetchText(this.site + chapterPath);
      const $ = loadCheerio(result);

      // Get the container with id="container"
      const container = $('#container');

      if (container.length === 0) {
        return 'Chapter content not found';
      }

      // Get the novel title from h1 tag
      const novelTitle = container.find('h1').text().trim();

      // Get the chapter title from h3 tag
      const chapterTitle = container.find('h3').text().trim();

      // Get the chapter content from the chapter-content div
      const chapterContent = container.find('.chapter-content');

      if (chapterContent.length === 0) {
        return 'Chapter content not found';
      }

      // Build the final chapter text with title and content
      let chapterText = '';

      if (chapterTitle) {
        chapterText += `<h3>${chapterTitle}</h3>\n\n`;
      }

      // Extract paragraphs and preserve their structure
      chapterContent.find('p').each((_, element) => {
        const paragraph = $(element).html();
        if (paragraph && paragraph.trim()) {
          chapterText += `<p>${paragraph.trim()}</p>\n`;
        }
      });

      // If no paragraphs found, get all text content
      if (
        !chapterText ||
        chapterText.trim() ===
          (chapterTitle ? `<h3>${chapterTitle}</h3>\n\n` : '')
      ) {
        const contentHtml = chapterContent.html();
        if (contentHtml) {
          // Clean up the HTML while preserving basic formatting
          chapterText = chapterTitle ? `<h3>${chapterTitle}</h3>\n\n` : '';
          chapterText += contentHtml.trim();
        }
      }

      return chapterText.trim() || 'Chapter content is empty';
    } catch (error) {
      console.error('Error parsing chapter:', error);
      return 'Error loading chapter content';
    }
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];

    try {
      // Fetch the library page to get all novels
      const result = await fetchText(`${this.site}/library`);
      const $ = loadCheerio(result);

      // Parse all novels from the library grid
      $('.library-grid .carousel-item').each((index, element) => {
        const novelElement = $(element);

        // Extract novel information
        const name = novelElement.find('.carousel-item-title').text().trim();
        const path = novelElement.attr('href');
        const cover = novelElement.find('img').attr('src');

        // Filter novels based on search term (case-insensitive)
        if (name.toLowerCase().includes(searchTerm.toLowerCase())) {
          novels.push({
            name: name,
            path: path || '',
            cover:
              cover && isUrlAbsolute(cover) ? cover : `${this.site}${cover}`,
          });
        }
      });

      // For pagination, we can split results into pages
      // Each page shows 20 novels
      const itemsPerPage = 20;
      const startIndex = (pageNo - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;

      return novels.slice(startIndex, endIndex);
    } catch (error) {
      console.error('Error searching novels:', error);
      return [];
    }
  }

  resolveUrl = (path: string, isNovel?: boolean) => this.site + path;
}

export default new FEN();
