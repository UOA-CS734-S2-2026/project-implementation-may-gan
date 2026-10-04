import openApiDocument from '../../../../../packages/contracts/openapi.json';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(openApiDocument, {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
