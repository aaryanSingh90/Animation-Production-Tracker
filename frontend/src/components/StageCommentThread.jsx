import { useEffect, useMemo, useRef, useState } from "react";
import api from "../lib/api";
import { formatRelative } from "../utils/format";
import { useToastStore } from "../store/toastStore";

const BASE_COMMENT_TYPES = [
  { value: "NOTE", label: "Note" },
  { value: "QUESTION", label: "Question" },
  { value: "FEEDBACK", label: "Feedback" },
  { value: "APPROVAL_NOTE", label: "Approval Note" }
];

function flattenCount(comments) {
  return comments.reduce((total, item) => total + 1 + (item.replies?.length || 0), 0);
}

function commentTypeBadgeTone(type) {
  if (type === "FEEDBACK") return "bg-red-50 text-red-700 border-red-200";
  if (type === "APPROVAL_NOTE") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (type === "QUESTION") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function CommentBubble({ comment, currentUserId, isManager, onDelete, onReply }) {
  const isOwn = comment.authorId === currentUserId;
  const isSystem = comment.isSystemGenerated;

  return (
    <div className={`mb-3 flex gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          isOwn ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"
        }`}
      >
        {comment.author?.name?.charAt(0)?.toUpperCase() || "U"}
      </div>

      <div className={`flex max-w-[85%] flex-col ${isOwn ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-xl px-3 py-2 text-sm ${
            isOwn
              ? "rounded-tr-none bg-sky-50"
              : isSystem
                ? "rounded-tl-none border border-slate-200 bg-slate-50"
                : "rounded-tl-none bg-slate-100"
          }`}
        >
          <div className="mb-1 text-xs font-semibold text-slate-500">
            {comment.author?.name || "Unknown"}
            {isSystem && <span className="ml-1 font-normal text-slate-400">(system)</span>}
          </div>
          <p className="whitespace-pre-wrap break-words text-slate-800">{comment.body}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${commentTypeBadgeTone(comment.type)}`}>
              {String(comment.type || "NOTE").replaceAll("_", " ")}
            </span>
            {comment.isEdited && <span className="text-[10px] text-slate-400">edited</span>}
          </div>
        </div>

        <div className={`mt-1 flex items-center gap-2 text-[11px] ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
          <span className="text-slate-400">{formatRelative(comment.createdAt)}</span>
          {!isSystem && (
            <button onClick={() => onReply(comment)} className="text-slate-500 hover:text-sky-600">
              Reply
            </button>
          )}
          {(isOwn || isManager) && !isSystem && (
            <button onClick={() => onDelete(comment.id)} className="text-slate-500 hover:text-red-600">
              Delete
            </button>
          )}
        </div>

        {comment.replies?.length > 0 && (
          <div className="mt-2 w-full space-y-2 border-l-2 border-slate-200 pl-3">
            {comment.replies.map((reply) => (
              <CommentBubble
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                isManager={isManager}
                onDelete={onDelete}
                onReply={onReply}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StageCommentThread({ stageId, currentUser, isManager, onCountChange }) {
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [type, setType] = useState("NOTE");
  const [replyTo, setReplyTo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef(null);

  const allowedTypes = useMemo(() => {
    if (isManager) return BASE_COMMENT_TYPES;
    return BASE_COMMENT_TYPES.filter((item) => item.value !== "APPROVAL_NOTE");
  }, [isManager]);

  const syncCount = (items) => {
    if (typeof onCountChange === "function") {
      onCountChange(flattenCount(items));
    }
  };

  const loadComments = async () => {
    try {
      const { data } = await api.get(`/stages/${stageId}/comments`);
      setComments(data);
      syncCount(data);
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Failed to load comments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      try {
        const { data } = await api.get(`/stages/${stageId}/comments`);
        if (!cancelled) {
          setComments(data);
          syncCount(data);
        }
      } catch (error) {
        if (!cancelled) {
          showToast("error", error.userMessage || error.response?.data?.message || "Failed to load comments");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [stageId]);

  const handleSubmit = async () => {
    const text = body.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    try {
      await api.post(`/stages/${stageId}/comments`, {
        body: text,
        type,
        parentId: replyTo?.id || null
      });
      setBody("");
      setReplyTo(null);
      await loadComments();
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId) => {
    const confirmed = window.confirm("Delete this comment?");
    if (!confirmed) return;

    try {
      await api.delete(`/comments/${commentId}`);
      await loadComments();
      showToast("success", "Comment deleted");
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Failed to delete comment");
    }
  };

  const handleKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  };

  if (loading) {
    return <div className="py-4 text-center text-sm text-slate-500">Loading comments...</div>;
  }

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="mb-3 max-h-72 overflow-y-auto pr-1">
        {!comments.length ? (
          <p className="py-4 text-center text-sm text-slate-500">No comments yet. Start the discussion.</p>
        ) : (
          comments.map((comment) => (
            <CommentBubble
              key={comment.id}
              comment={comment}
              currentUserId={currentUser?.id}
              isManager={isManager}
              onDelete={handleDelete}
              onReply={setReplyTo}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded bg-sky-50 px-2 py-1 text-xs text-sky-700">
          <span>Replying to {replyTo.author?.name || "comment"}</span>
          <button onClick={() => setReplyTo(null)} className="ml-auto text-slate-500 hover:text-slate-700" aria-label="Cancel reply">
            x
          </button>
        </div>
      )}

      <div className="mb-2 flex flex-wrap gap-1">
        {allowedTypes.map((item) => (
          <button
            key={item.value}
            onClick={() => setType(item.value)}
            className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
              type === item.value
                ? "border-sky-300 bg-sky-50 text-sky-700"
                : "border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a comment... (Ctrl/Cmd+Enter to send)"
          rows={2}
          className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-300 focus:outline-none"
        />
        <button
          onClick={handleSubmit}
          disabled={!body.trim() || submitting}
          className="whitespace-nowrap rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {submitting ? "Sending..." : "Send"}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">Ctrl/Cmd+Enter to send</p>
    </div>
  );
}
