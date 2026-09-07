import { BlogEditor } from "@/components/blogs/BlogEditor";

type Params = { params: Promise<{ id: string }> };

export default async function BlogEditPage({ params }: Params) {
  const { id } = await params;
  return <BlogEditor blogId={id} />;
}
