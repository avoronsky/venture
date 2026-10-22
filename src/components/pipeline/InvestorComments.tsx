import {useAuth} from "@/hooks/useAuth";
import {useOrg} from "@/hooks/useOrg";
import {useActivity, useAddComment, useDeleteComment, useUpdateComment} from "@/hooks/usePipeline";
import {CommentTimeline} from "@/components/comments/CommentTimeline";

/** Shared, dated comments on a pipeline investor, with stage history. */
export function InvestorComments({investorId}: {investorId: string}) {
    const {email} = useAuth();
    const {org, canEdit, isOwner} = useOrg();
    const {data = [], isLoading, isError, refetch} = useActivity(org.id, investorId);
    const add = useAddComment(org.id);
    const update = useUpdateComment(org.id);
    const del = useDeleteComment(org.id);
    const mine = (authorEmail: string | null) => Boolean(email && authorEmail === email);

    return (
        <CommentTimeline
            entries={data}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => refetch()}
            canAdd={canEdit}
            showAuthors
            canChange={(e) => canEdit && mine(e.author_email)}
            canDelete={(e) => (canEdit && mine(e.author_email)) || isOwner}
            onAdd={({body, occurredOn}) => add.mutateAsync({investorId, body, occurredOn})}
            onUpdate={(e, {body, occurredOn}) => update.mutateAsync({id: e.id, investorId, body, occurredOn})}
            onDelete={(e) => del.mutate({id: e.id, investorId})}
            deleteDescription={`It's removed for everyone in ${org.name}. This can't be undone.`}
            emptyText={canEdit
                ? "Add notes from calls, emails and meetings. Each one is dated, so you can see how the conversation went over time."
                : "Nobody has commented on this investor yet."}
        />
    );
}
