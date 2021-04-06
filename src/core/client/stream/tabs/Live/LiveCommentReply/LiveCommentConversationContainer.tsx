import React, { FunctionComponent, useCallback, useState } from "react";
import { commitLocalUpdate, graphql } from "react-relay";
import { ConnectionHandler } from "relay-runtime";

import { useCoralContext } from "coral-framework/lib/bootstrap";
import {
  deleteConnection,
  withFragmentContainer,
} from "coral-framework/lib/relay";
import { LiveChatJumpToReplyEvent } from "coral-stream/events";
import { Flex, Icon } from "coral-ui/components/v2";
import { Button } from "coral-ui/components/v3";

import { GQLUSER_STATUS } from "coral-framework/schema/__generated__/types";
import { LiveCommentConversationContainer_comment } from "coral-stream/__generated__/LiveCommentConversationContainer_comment.graphql";
import { LiveCommentConversationContainer_settings } from "coral-stream/__generated__/LiveCommentConversationContainer_settings.graphql";
import { LiveCommentConversationContainer_story } from "coral-stream/__generated__/LiveCommentConversationContainer_story.graphql";
import { LiveCommentConversationContainer_viewer } from "coral-stream/__generated__/LiveCommentConversationContainer_viewer.graphql";
import { LiveReplyContainer_comment } from "coral-stream/__generated__/LiveReplyContainer_comment.graphql";

import LiveEditCommentFormContainer from "../LiveEditComment/LiveEditCommentFormContainer";
import ShortcutIcon from "../ShortcutIcon";
import LiveCommentRepliesQuery from "./LiveCommentReplies/LiveCommentRepliesQuery";
import LiveCreateCommentReplyFormContainer from "./LiveCreateCommentReplyFormContainer";

import styles from "./LiveCommentConversationContainer.css";

interface Props {
  settings: LiveCommentConversationContainer_settings;
  viewer: LiveCommentConversationContainer_viewer | null;
  story: LiveCommentConversationContainer_story;
  comment: LiveCommentConversationContainer_comment;

  visible?: boolean;
  onClose: () => void;
  onSubmitted?: (commentID: string | undefined, cursor: string) => void;
}

interface NewComment {
  id: string;
  cursor: string;
}

interface EditingCommentViewState {
  visible: boolean;
  comment: LiveReplyContainer_comment;
}

const LiveCommentConversationContainer: FunctionComponent<Props> = ({
  settings,
  viewer,
  story,
  comment,
  onClose,
  onSubmitted,
  visible,
}) => {
  const { eventEmitter, relayEnvironment } = useCoralContext();

  const banned = !!viewer?.status.current.includes(GQLUSER_STATUS.BANNED);
  const suspended = !!viewer?.status.current.includes(GQLUSER_STATUS.SUSPENDED);
  const warned = !!viewer?.status.current.includes(GQLUSER_STATUS.WARNED);

  const showReplyForm = !banned && !suspended && !warned;

  const [newlyPostedReply, setNewlyPostedReply] = useState<NewComment | null>(
    null
  );
  const [tailing, setTailing] = useState<boolean>(false);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  const [cursor, setCursor] = useState(new Date(0).toISOString());

  const [
    editingComment,
    setEditingComment,
  ] = useState<EditingCommentViewState | null>(null);

  // The pagination container wouldn't allow us to start a new connection
  // by refetching with a different cursor. So we delete the connection first,
  // before starting the refetch.
  const deleteConnectionsAndSetCursor = useCallback(
    (s: string) => {
      commitLocalUpdate(relayEnvironment, (store) => {
        // TODO: (cvle) use `getConnectionID` after update:
        // https://github.com/facebook/relay/pull/3332
        const commentRecord = store.get(comment.id)!;
        const chatAfter = ConnectionHandler.getConnection(
          commentRecord,
          "Replies_after"
        );
        const chatBefore = ConnectionHandler.getConnection(
          commentRecord,
          "Replies_before"
        );

        if (chatBefore) {
          deleteConnection(store, chatBefore.getDataID());
        }
        if (chatAfter) {
          deleteConnection(store, chatAfter.getDataID());
        }
      });

      setCursor(s);
    },
    [comment.id, relayEnvironment]
  );

  const submit = useCallback(
    (commentID: string | undefined, cur: string) => {
      if (commentID && !tailing) {
        setNewlyPostedReply({
          id: commentID,
          cursor: cur,
        });
      }

      if (onSubmitted) {
        onSubmitted(commentID, cur);
      }
    },
    [onSubmitted, tailing]
  );

  const jumpToReply = useCallback(() => {
    if (newlyPostedReply && newlyPostedReply.cursor) {
      setNewlyPostedReply(null);
      deleteConnectionsAndSetCursor(newlyPostedReply.cursor);

      LiveChatJumpToReplyEvent.emit(eventEmitter, {
        storyID: story.id,
        commentID: newlyPostedReply.id,
        viewerID: viewer ? viewer.id : "",
      });
    }
  }, [
    deleteConnectionsAndSetCursor,
    eventEmitter,
    newlyPostedReply,
    story.id,
    viewer,
  ]);

  const closeJumpToReply = useCallback(() => {
    if (!newlyPostedReply) {
      return;
    }

    setNewlyPostedReply(null);
  }, [newlyPostedReply, setNewlyPostedReply]);

  const handleCommentInView = useCallback(
    (commentVisible: boolean, commentID: string) => {
      if (
        commentVisible &&
        newlyPostedReply &&
        commentID === newlyPostedReply.id
      ) {
        setNewlyPostedReply(null);
      }
    },
    [newlyPostedReply]
  );

  const handleOnEdit = useCallback((c: LiveReplyContainer_comment) => {
    setEditingComment({ comment: c, visible: true });
  }, []);
  const handleOnCloseEdit = useCallback(() => {
    setEditingComment(null);
  }, [setEditingComment]);
  const handleRefreshSettingsFromEdit = useCallback(
    async (refreshSettings: { storyID: string }) => {
      // TODO: implement refresh settings.
    },
    []
  );

  if (!visible) {
    return null;
  }

  if (!comment.revision) {
    return null;
  }

  return (
    <>
      <div className={styles.overlay}></div>
      <div className={styles.root}>
        <Button className={styles.closeButton} onClick={close} color="none">
          <Icon className={styles.closeIcon}>cancel</Icon>
        </Button>

        <div className={styles.title}>
          <Flex justifyContent="flex-start" alignItems="center">
            <ShortcutIcon
              width="14px"
              height="14px"
              className={styles.replyingToIcon}
            />
            <div className={styles.replyingTo}>Replying to</div>
            <div className={styles.username}>
              {comment.author ? comment.author.username || "" : ""}
            </div>
          </Flex>
        </div>

        <LiveCommentRepliesQuery
          commentID={comment.id}
          storyID={story.id}
          cursor={cursor}
          tailing={tailing}
          setTailing={setTailing}
          onCommentInView={handleCommentInView}
          onEdit={handleOnEdit}
          onCancelEdit={handleOnCloseEdit}
          editingCommentID={
            editingComment ? editingComment.comment.id : undefined
          }
        />

        {newlyPostedReply && (
          <div className={styles.scrollToNewReply}>
            <Flex justifyContent="center" alignItems="center">
              <Flex alignItems="center">
                <Button
                  onClick={jumpToReply}
                  color="primary"
                  className={styles.jumpButton}
                >
                  Reply posted below <Icon>arrow_downward</Icon>
                </Button>
                <Button
                  onClick={closeJumpToReply}
                  color="primary"
                  aria-valuetext="close"
                  className={styles.jumpButtonClose}
                >
                  <Icon>close</Icon>
                </Button>
              </Flex>
            </Flex>
          </div>
        )}

        {editingComment && editingComment.visible && (
          <LiveEditCommentFormContainer
            comment={editingComment.comment}
            story={story}
            settings={settings}
            viewer={viewer}
            onClose={handleOnCloseEdit}
            onRefreshSettings={handleRefreshSettingsFromEdit}
            autofocus
          />
        )}
        {!editingComment && showReplyForm && (
          <LiveCreateCommentReplyFormContainer
            settings={settings}
            viewer={viewer}
            story={story}
            parentID={comment.id}
            parentRevisionID={comment.revision.id}
            onSubmitted={submit}
          />
        )}
      </div>
    </>
  );
};

const enhanced = withFragmentContainer<Props>({
  story: graphql`
    fragment LiveCommentConversationContainer_story on Story {
      id
      url
      ...LiveCreateCommentReplyFormContainer_story
      ...LiveEditCommentFormContainer_story
    }
  `,
  viewer: graphql`
    fragment LiveCommentConversationContainer_viewer on User {
      id
      status {
        current
      }
      ...LiveCommentContainer_viewer
      ...LiveCreateCommentReplyFormContainer_viewer
      ...LiveEditCommentFormContainer_viewer
    }
  `,
  settings: graphql`
    fragment LiveCommentConversationContainer_settings on Settings {
      ...LiveCommentContainer_settings
      ...LiveCreateCommentReplyFormContainer_settings
      ...LiveEditCommentFormContainer_settings
    }
  `,
  comment: graphql`
    fragment LiveCommentConversationContainer_comment on Comment {
      id
      revision {
        id
      }
      author {
        id
        username
      }
      body
      createdAt
      parent {
        author {
          id
          username
        }
        createdAt
        body
      }
    }
  `,
})(LiveCommentConversationContainer);

export default enhanced;
