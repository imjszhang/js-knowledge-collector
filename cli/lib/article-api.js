/**
 * Shared article HTTP handlers used by standalone serve and the OpenClaw plugin.
 */

export function parseArticlesQuery(searchParams) {
    const get = typeof searchParams.get === 'function'
        ? (key) => searchParams.get(key)
        : (key) => searchParams[key];
    const page = parseInt(get('page'), 10) || 1;
    const perPage = parseInt(get('perPage'), 10) || 12;
    return {
        page,
        perPage,
        source: get('source') || '',
        keyword: get('keyword') || '',
        sourceUrl: get('sourceUrl') || '',
        sort: get('sort') || '',
        full: get('full') === '1' || get('full') === 'true',
    };
}

export async function listArticlesPayload(db, searchParams) {
    const query = parseArticlesQuery(searchParams);
    const result = await db.getArticles(query);
    return { statusCode: 200, body: { status: 'success', ...result } };
}

export async function createArticlePayload(db, data = {}) {
    const result = await db.addRecord({
        id: data.id,
        title: data.title,
        summary: data.summary,
        digest: data.digest,
        content: data.content,
        cover_url: data.cover_url,
        source_url: data.source_url,
        created: data.created,
        updated: data.updated,
        recommend: data.recommend,
    });
    if (result.existed) {
        return {
            statusCode: 409,
            body: {
                status: 'exists',
                record_id: result.record_id,
                message: result.message || '记录已存在',
            },
        };
    }
    return {
        statusCode: 200,
        body: {
            status: 'success',
            record_id: result.record_id,
            message: result.message || '记录添加成功',
        },
    };
}

export async function articleDetailPayload(db, id) {
    const record = await db.getRecord(id);
    if (!record) {
        return { statusCode: 404, body: { status: 'error', message: '文章不存在' } };
    }
    return { statusCode: 200, body: { status: 'success', data: record } };
}

export async function deleteArticlePayload(db, id) {
    try {
        const result = await db.deleteRecord(id);
        return { statusCode: 200, body: result };
    } catch (err) {
        return { statusCode: 404, body: { status: 'error', message: err.message } };
    }
}

export async function statsPayload(db) {
    const stats = await db.getStats();
    return { statusCode: 200, body: stats };
}

export async function healthPayload(db, mode) {
    const stats = await db.getStats();
    return {
        statusCode: 200,
        body: {
            status: 'ok',
            mode: mode || 'local',
            total: stats.total ?? 0,
        },
    };
}
