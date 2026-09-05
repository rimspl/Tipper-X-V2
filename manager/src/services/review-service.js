async function parseJson(response) {
  return response.json().catch(() => ({}));
}

export async function fetchReviewQueue(siteId, limit = 40) {
  const url = new URL('/api/v1/review/queue', window.location.origin);
  if (siteId) {
    url.searchParams.set('site_id', siteId);
  }
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url.toString(), {
    method: 'GET'
  });
  const json = await parseJson(response);

  if (!response.ok || !json.success) {
    throw new Error(json.error || `Failed to fetch review queue (${response.status})`);
  }

  return Array.isArray(json.items) ? json.items : [];
}

export async function resolveReviewItem({ reviewId, action, correctedFields, actorId }) {
  const payload = {
    review_id: reviewId,
    action,
    corrected_fields: correctedFields || {}
  };

  const response = await fetch('/api/v1/review/action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': actorId
    },
    body: JSON.stringify(payload)
  });

  const json = await parseJson(response);
  if (!response.ok || !json.success) {
    throw new Error(json.error || `Failed to apply review action (${response.status})`);
  }

  return json;
}

export async function fetchEvidenceUrls(submissionId) {
  const url = new URL('/api/v1/review/evidence', window.location.origin);
  url.searchParams.set('submission_id', submissionId);

  const response = await fetch(url.toString(), { method: 'GET' });
  const json = await parseJson(response);

  if (!response.ok || !json.success) {
    throw new Error(json.error || `Failed to fetch evidence (${response.status})`);
  }

  return Array.isArray(json.evidence) ? json.evidence : [];
}
