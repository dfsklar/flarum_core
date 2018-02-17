import DiscussionPage from 'flarum/components/DiscussionPage';
import DiscussionHero from 'flarum/components/DiscussionHero';
import DiscussionList from 'flarum/components/DiscussionList';
import ReplyComposer from 'flarum/components/ReplyComposer';
import LogInModal from 'flarum/components/LogInModal';
import Button from 'flarum/components/Button';
import Separator from 'flarum/components/Separator';
import RenameDiscussionModal from 'flarum/components/RenameDiscussionModal';
import ItemList from 'flarum/utils/ItemList';
import extractText from 'flarum/utils/extractText';
import EditPostComposer from 'flarum/components/EditPostComposer';


/**
 * The `DiscussionControls` utility constructs a list of buttons for a
 * discussion which perform actions on it.
 */
export default {
  /**
   * Get a list of controls for a discussion.
   * 
   * DFSKLARD: A DiscussionHero context should show only one button: COMMENTCOM
   *
   * @param {Discussion} discussion
   * @param {*} context The parent component under which the controls menu will
   *     be displayed.
   * @return {ItemList}
   * @public
   */
  controls(discussion, context) {
    const items = new ItemList();

    const sections = 
        (context instanceof DiscussionHero) ? ['user'] : ['user', 'moderation', 'destructive'];
    sections.forEach(section => {
        const controls = this[section + 'Controls'](discussion, context).toArray();
        if (controls.length) {
          controls.forEach(item => items.add(item.itemName, item));
          items.add(section + 'Separator', Separator.component());
        }
      });
    return items;
  },

  /**
   * Get controls for a discussion pertaining to the current user (e.g. reply,
   * follow).
   *
   * @param {Discussion} discussion
   * @param {*} context The parent component under which the controls menu will
   *     be displayed.
   * @return {ItemList}
   * @protected
   */
  userControls(discussion, context) {
    const items = new ItemList();

    // Only add a COMMENT control if this is the discussion's controls dropdown
    // for the discussion page itself. We don't want it to show up for
    // discussions in the discussion list, etc.

    // DFSKLARD: Determine the group to which this discussion belongs.
    const primaryTagID = discussion.data.relationships.tags.data[0].id;
    const primaryTag = app.store.getBy('tags', 'id', primaryTagID);
    const groupSlug = primaryTag.data.attributes.slug;
    this.matchingGroup = app.store.getBy('groups', 'slug', groupSlug);
    this.loggedinUserMembershipList = app.session.user.data.relationships.groups.data;
    this.isMemberOfGroup = this.loggedinUserMembershipList.some(group => (group.id == this.matchingGroup.data.id));
    
    if (context instanceof DiscussionHero)
      items.add('comment',
        ( this.isMemberOfGroup )
        ?
        Button.component({
          icon: 'comment',
          className: 'Button-CreateComment',
          children: app.translator.trans('core.forum.discussion_controls.comment_button'),
          title: app.translator.trans('core.forum.discussion_controls.comment_button'),
          onclick: this.replyAction.bind(discussion, true, false)
        }) :
        Button.component({
          icon: 'comment',
          children: [ 'Join this group to add your commentary!' ],
          className: 'disabled',
          title: 'Cannot comment yet'
        }) );

    return items;
  },



  /**
   * Get controls for a discussion pertaining to moderation (e.g. rename, lock).
   *
   * @param {Discussion} discussion
   * @param {*} context The parent component under which the controls menu will
   *     be displayed.
   * @return {ItemList}
   * @protected
   */
  moderationControls(discussion) {
    const items = new ItemList();

    // DFSKLARD: renaming is not part of Formed.org culture
    if (false && discussion.canRename()) {
      items.add('rename', Button.component({
        icon: 'pencil',
        children: app.translator.trans('core.forum.discussion_controls.rename_button'),
        onclick: this.renameAction.bind(discussion)
      }));
    }

    return items;
  },



  /**
   * Get controls for a discussion which are destructive (e.g. delete).
   *
   * @param {Discussion} discussion
   * @param {*} context The parent component under which the controls menu will
   *     be displayed.
   * @return {ItemList}
   * @protected
   */
  destructiveControls(discussion) {
    const items = new ItemList();

    if (!discussion.isHidden()) {
      if (discussion.canHide()) {
        items.add('edit', Button.component({
          icon: 'pencil',
          children: [ 'Edit' ],
          onclick: this.editFirstPostAction.bind(discussion)
        }));
        items.add('hide', Button.component({
          icon: 'trash-o',
          children: app.translator.trans('core.forum.discussion_controls.delete_button'),
          onclick: this.hideAction.bind(discussion)
        }));
      }
    } else {
      if (discussion.canHide()) {
        items.add('restore', Button.component({
          icon: 'reply',
          children: app.translator.trans('core.forum.discussion_controls.restore_button'),
          onclick: this.restoreAction.bind(discussion)
        }));
      }

      if (discussion.canDelete()) {
        items.add('delete', Button.component({
          icon: 'times',
          children: app.translator.trans('core.forum.discussion_controls.delete_forever_button'),
          onclick: this.deleteAction.bind(discussion)
        }));
      }
    }

    return items;
  },

  /**
   * Open the reply composer for the discussion. A promise will be returned,
   * which resolves when the composer opens successfully. If the user is not
   * logged in, they will be prompted. If they don't have permission to
   * reply, the promise will be rejected.
   *
   * @param {Boolean} goToLast Whether or not to scroll down to the last post if
   *     the discussion is being viewed.
   * @param {Boolean} forceRefresh Whether or not to force a reload of the
   *     composer component, even if it is already open for this discussion.
   * @return {Promise}
   */
  replyAction(goToLast, forceRefresh) {
    const deferred = m.deferred();

    if (app.session.user) {
      if (this.canReply()) {
        let component = app.composer.component;
        if (!app.composingReplyTo(this) || forceRefresh) {
          component = new ReplyComposer({
            user: app.session.user,
            discussion: this
          });
          app.composer.load(component);
        }
        app.composer.show();

        if (goToLast && app.viewingDiscussion(this) && ! app.composer.isFullScreen()) {
          app.current.stream.goToNumber('reply');
        }

        deferred.resolve(component);
      } else {
        deferred.reject();
      }
    } else {
      app.modal.show(new LogInModal());
    }

    return deferred.promise;
  },




  /**
   * Edit the very first post of the discussion.
   */
  editFirstPostAction() {
    // "this" IS THE DISCUSSION OBJECT.is.data.relationships.startPost.data.id
    const IDstartingpost = this.data.relationships.startPost.data.id;
    const post = app.store.getById('posts', IDstartingpost);
    app.composer.load(new EditPostComposer({ post: post }));
    app.composer.show();
  },




  /**
   * Hide a discussion.
   *
   * @return {Promise}
   */
  hideAction() {
    this.pushAttributes({ hideTime: new Date(), hideUser: app.session.user });

    return this.save({ isHidden: true });
  },

  /**
   * Restore a discussion.
   *
   * @return {Promise}
   */
  restoreAction() {
    this.pushAttributes({ hideTime: null, hideUser: null });

    return this.save({ isHidden: false });
  },

  /**
   * Delete the discussion after confirming with the user.
   *
   * @return {Promise}
   */
  deleteAction() {
    if (confirm(extractText(app.translator.trans('core.forum.discussion_controls.delete_confirmation')))) {
      // If we're currently viewing the discussion that was deleted, go back
      // to the previous page.
      if (app.viewingDiscussion(this)) {
        app.history.back();
      }

      return this.delete().then(() => {
        // If there is a discussion list in the cache, remove this discussion.
        if (app.cache.discussionList) {
          app.cache.discussionList.removeDiscussion(this);
          m.redraw();
        }
      });
    }
  },





  /**
   * Rename the discussion.
   *
   * @return {Promise}
   */
  renameAction() {
    return app.modal.show(new RenameDiscussionModal({
      currentTitle: this.title(),
      discussion: this
    }));
  }
};
