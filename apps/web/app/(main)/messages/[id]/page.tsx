import { Conversation } from "@/components/messages/Conversation";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Conversation conversationId={id} />;
}
