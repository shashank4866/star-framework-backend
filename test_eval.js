async function test() {
  try {
    const resAuth = await fetch('http://localhost:3000/api/auth/login', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ email: 'bob@test.com', password: 'password123' })
    });
    const cookie = resAuth.headers.get('set-cookie');
    
    const resPending = await fetch('http://localhost:3000/api/architect/pending', {
        headers: { Cookie: cookie }
    });
    const pendingData = await resPending.json();
    if (pendingData.length === 0) { console.log('no pending'); return; }
    const attempt_id = pendingData[0].attempt_id;
    
    const resReplay = await fetch(`http://localhost:3000/api/architect/attempt/${attempt_id}`, {
        headers: { Cookie: cookie }
    });
    const replayData = await resReplay.json();
    
    const evals = replayData.questions.filter(q => q.type !== 'MCQ').map(q => ({
        question_id: q.question_id, score: 50, reviewer_feedback: 'good'
    }));
    
    const evalRes = await fetch(`http://localhost:3000/api/architect/attempt/${attempt_id}/evaluate`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', Cookie: cookie },
       body: JSON.stringify({
           evaluations: evals,
           overall_feedback: 'overall good'
       })
    });
    const evalData = await evalRes.json();
    console.log(evalData);
  } catch(err) {
    console.error(err);
  }
}
test();
