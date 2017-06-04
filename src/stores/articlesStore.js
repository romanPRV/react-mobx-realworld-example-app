import { observable, action, computed } from 'mobx';
import agent from '../agent';

const LIMIT = 10;
const TYPES = ['', 'MyFeed', 'FavoritedBy', 'Tag', 'Author'];

export class ArticlesStore {

  @observable reloadRequired = false;
  @observable currPage = 0;
  @observable totalAllPagesCount = 0;
  @observable articlesRegistry = observable.map();

  @observable reloadRequiredMyFeed = false;
  @observable currPageMyFeed = 0;
  @observable totalAllPagesCountMyFeed = 0;
  @observable articlesRegistryMyFeed = observable.map();

  @observable reloadRequiredFavoritedBy = false;
  @observable currPageFavoritedBy = 0;
  @observable totalAllPagesCountFavoritedBy = 0;
  @observable articlesRegistryFavoritedBy = observable.map();

  @observable reloadRequiredTag = false;
  @observable currPageTag = 0;
  @observable totalAllPagesCountTag = 0;
  @observable articlesRegistryTag = observable.map();

  @observable reloadRequiredAuthor = false;
  @observable currPageAuthor = 0;
  @observable totalAllPagesCountAuthor = 0;
  @observable articlesRegistryAuthor = observable.map();

  @observable isLoading = false;
  @observable favoritedBy = '';
  @observable author = '';
  @observable predicate = {};

  @computed get articles() {
      const type = this.getType();
      return this[`articlesRegistry${type}`].values();
  };

  @computed get page() {
      const type = this.getType();
      return this[`currPage${type}`];
  };

  @computed get totalPagesCount() {
      const type = this.getType();
      return this[`totalAllPagesCount${type}`];
  };

  clearStores() {
      TYPES.forEach(type => {
          this[`articlesRegistry${type}`].clear();
          this[`currPage${type}`] = 0;
          this[`totalAllPagesCount${type}`] = 0;
      });
  }

  getArticle(slug, type = '') {
    return this[`articlesRegistry${type}`].get(slug);
  }

  @action setPage(page) {
    const type = this.getType();
    this[`currPage${type}`] = page;
    this[`reloadRequired${type}`] = true;
  }

  @action setPredicate(predicate) {
    if (JSON.stringify(predicate) === JSON.stringify(this.predicate)) return;
    this.predicate = predicate;
    const type = this.getType();
    if (this.predicate.favoritedBy && this.predicate.favoritedBy !== this.favoritedBy) {
        this[`reloadRequired${type}`] = true;
        this.favoritedBy = this.predicate.favoritedBy;
    }
    if (this.predicate.author && this.predicate.author !== this.author) {
        this[`reloadRequired${type}`] = true;
        this.author = this.predicate.author;
    }
  }

  $req() {
    if (this.predicate.myFeed) return agent.Articles.feed(this.page, LIMIT);
    if (this.predicate.favoritedBy) return agent.Articles.favoritedBy(this.predicate.favoritedBy, this.page, LIMIT);
    if (this.predicate.tag) return agent.Articles.byTag(this.predicate.tag, this.page, LIMIT);
    if (this.predicate.author) return agent.Articles.byAuthor(this.predicate.author, this.page, LIMIT);
    return agent.Articles.all(this.page, LIMIT);
  }

  getType() {
      if (this.predicate.myFeed) return 'MyFeed';
      if (this.predicate.favoritedBy) return 'FavoritedBy';
      if (this.predicate.tag) return 'Tag';
      if (this.predicate.author) return 'Author';
      return '';
  }

  getArticleFromStores(slug) {
      const result = [];
      TYPES.forEach(type => {
          const article = this.getArticle(slug, type);
          if (article) {
              result.push(article);
          }
      });
      return result;
  }

  @action loadArticles() {
    const type = this.getType();
    if (this[`reloadRequired${type}`] || !this[`articlesRegistry${type}`].size) {
        this.isLoading = true;
        return this.$req()
          .then(action(({ articles, articlesCount }) => {
            this[`articlesRegistry${type}`].clear();
            articles.forEach(article => this[`articlesRegistry${type}`].set(article.slug, article));
            this[`totalAllPagesCount${type}`] = Math.ceil(articlesCount / LIMIT);
          }))
          .finally(action(() => { this.isLoading = false; this[`reloadRequired${type}`] = false; }));
    }
    return Promise.resolve();
  }

  @action loadArticle(slug, { acceptCached = false } = {}) {
    if (acceptCached) {
      const article = this.getArticle(slug);
      if (article) return Promise.resolve(article);
    }
    this.isLoading = true;
    return agent.Articles.get(slug)
      .then(action(({ article }) => {
        this.articlesRegistry.set(article.slug, article);
        return article;
      }))
      .finally(action(() => { this.isLoading = false; }));
  }

  @action makeFavorite(slug) {
    let isSet = false;
    const articleFromStores = this.getArticleFromStores(slug);
    articleFromStores.forEach(article => {
        if (!article.favorited) {
            isSet = true;
            article.favorited = true;
            article.favoritesCount++;
        }
    });
    return isSet ? agent.Articles.favorite(slug)
      .catch(action(err => {
          articleFromStores.forEach(article => {
              if (article.favorited) {
                  article.favorited = false;
                  article.favoritesCount--;
              }
          });
          throw err;
    })) : Promise.resolve();
  }

  @action unmakeFavorite(slug) {
      let isSet = false;
      const articleFromStores = this.getArticleFromStores(slug);
      articleFromStores.forEach(article => {
          if (article.favorited) {
              isSet = true;
              article.favorited = false;
              article.favoritesCount--;
          }
      });
      return isSet ? agent.Articles.unfavorite(slug)
        .catch(action(err => {
            articleFromStores.forEach(article => {
                if (!article.favorited) {
                    article.favorited = true;
                    article.favoritesCount++;
                }
            });
            throw err;
      })) : Promise.resolve();
  }

  @action createArticle(article) {
    return agent.Articles.create(article)
      .then(({ article }) => {
        this.clearStores();
        return article;
      })
  }

  @action updateArticle(data) {
    return agent.Articles.update(data)
      .then(({ article }) => {
          TYPES.forEach(type => {
              if (this.getArticle(article.slug, type)) {
                  this[`articlesRegistry${type}`].set(article.slug, article);
              }
          });
          return article;
      })
  }

  @action deleteArticle(slug) {
    this.clearStores();
    return agent.Articles.del(slug)
      .catch(action(err => { this.loadArticles(); throw err; }));
  }
}

export default new ArticlesStore();
