const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const P = require('../js/python.js');
const T = require('../js/tasks.js');
const C = require('../js/core.js');
const profile={firstName:'Тест',lastName:'Ученик',className:'7 А'};
const qByType=type=>T.generateQuestions(12,42).find(q=>q.type===type);

test('3,000 generated tasks: all model answers pass and original broken code fails',()=>{
  for(let seed=0;seed<250;seed++) {
    const questions=T.generateQuestions(12,seed);
    assert.equal(new Set(questions.map(q=>q.type)).size,12);
    for(const q of questions) {
      const answer=typeof q.answer==='object'?JSON.stringify(q.answer):q.answer;
      assert.ok(T.isAnswered(q,answer),q.type);
      assert.ok(T.checkAnswer(q,answer),`${q.type} seed=${seed}`);
      assert.equal(T.checkAnswer(q,''),false);
      if(q.kind==='code')assert.equal(T.checkAnswer(q,q.code[q.editLine]),false,`${q.type}: unchanged code passed`);
    }
  }
});

test('generated outputs, types and corrected programs agree with real CPython',()=>{
  const corpus=[];
  for(let seed=0;seed<100;seed++)for(const q of T.generateQuestions(12,seed)) {
    if(q.kind==='code')for(const t of q.tests)corpus.push({code:T.programFor(q,q.answer),input:t.input,expected:t.output});
    else if(q.category==='reading')corpus.push({code:q.code.join('\n'),input:[],expected:q.answer});
    else if(q.kind==='choice')corpus.push({code:q.code.join('\n')+`\nprint(type(${q.type==='literal-type'?'value':'x'}).__name__)`,input:[],expected:q.answer});
    else if(q.type==='match-types')q.pairs.forEach(p=>corpus.push({code:`print(type(${p.left}).__name__)`,input:[],expected:q.answer[p.id]}));
  }
  const script=String.raw`
import sys,json,io,contextlib
rows=json.load(sys.stdin)
for i,row in enumerate(rows):
    inputs=iter(row['input'])
    output=io.StringIO()
    env={'__builtins__':{'print':print,'input':lambda:next(inputs),'int':int,'float':float,'str':str,'bool':bool,'list':list,'len':len,'type':type}}
    with contextlib.redirect_stdout(output):exec(row['code'],env)
    actual=output.getvalue().removesuffix('\n')
    if actual!=row['expected']:
        print(json.dumps({'row':i,'code':row['code'],'expected':row['expected'],'actual':actual},ensure_ascii=False))
        sys.exit(1)
print(f'{len(rows)} cases agree with CPython')
`;
  const proc=spawnSync('python3',['-c',script],{input:JSON.stringify(corpus),encoding:'utf8',maxBuffer:10*1024*1024});
  assert.equal(proc.status,0,proc.stderr+proc.stdout+(proc.error||''));
  assert.match(proc.stdout,/2700 cases agree/);
});

test('sandbox respects Python types, precedence, negative division and short circuit',()=>{
  const cases=[
    ['print(7 / 2)','3.5'],['print(8 / 2)','4.0'],['print(8.0 // 2)','4.0'],
    ['print(-7 // 3, -7 % 3)','-3 2'],['print(7 % -3)','-2'],
    ['print(-2 ** 2, (-2) ** 2, 2 ** 3 ** 2)','-4 4 512'],['print(2 ** -2)','0.25'],
    ['print(False and 1 / 0, True or missing)','False True'],
    ['print(not 1 == 2, 1 < 2 < 3)','True True'],['print(3 < 2 < missing)','False'],
    ['print(int(4.9), int(-4.9), float("4"), str(True))','4 -4 4.0 True'],
    ['print(bool("False"), bool(""), bool(0), bool([]))','True False False False'],
    ['print(len("кот"), len("😀"), [7, 8, 9][-1])','3 1 9'],
    ['print("a" * 3 + "!", 3 * "b")','aaa! bbb'],
    ['print([1, 2] + [3], [1] * 2)','[1, 2, 3] [1, 1]'],
    ['print("print # not a comment", 7) # comment','print # not a comment 7'],
  ];
  for(const [source,expected] of cases) {const result=P.run(source);assert.ok(result.ok,result.error);assert.equal(result.output,expected,source);}
  const types=P.run('a = 2\nb = 2.0\nc = True\nd = "2"\ne = [2]');
  assert.deepEqual(Object.values(types.env).map(v=>v.type),['int','float','bool','str','list']);
});

test('sandbox reports errors and cannot call JavaScript, import, loop or allocate huge outputs',()=>{
  for(const code of [
    'print(1 / 0)','print("7" + 1)','print(int("2.5"))','print(float("2,5"))',
    'print(unknown)','print([1][5])','print("x")\nimport os','while True: pass',
    'print(globalThis)','print(eval("1+1"))','print(open("file"))','print(__import__("os"))',
    'print("x" * 999999)','print(2 ** 99999)','print(7','print("abc)',
    'print(1); print(2)','True = 3','print(012)',
  ])assert.equal(P.run(code).ok,false,code);
  assert.equal(P.run('x = input()').ok,false);
  assert.equal(P.run('print("<script>")').output,'<script>');
});

test('equivalent code is accepted; constants and multiline replacements are rejected',()=>{
  const fix=qByType('fix-string-number'),label=fix.params.label;
  assert.ok(T.checkAnswer(fix,`print('${label}:', score)`));
  assert.ok(T.checkAnswer(fix,`print('${label}: ' + str((score))) # объяснение`));
  assert.equal(T.checkAnswer(fix,`print('${fix.sampleOutput}')`),false);
  assert.equal(T.checkAnswer(fix,'print(score)\nprint(score)'),false);
  const calc=qByType('change-formula');
  assert.ok(T.checkAnswer(calc,calc.params.mode==='area'?'print(b * a)':'print(a + a + b + b)'));
  assert.equal(T.checkAnswer(calc,`print(${calc.sampleOutput})`),false);
  const input=qByType('fix-input');
  assert.ok(T.checkAnswer(input,'age = int( input() )'));
});

test('all four formats and all topics are present at each supported size, with no repeats',()=>{
  for(const count of C.COUNTS)for(let seed=0;seed<100;seed++) {
    const qs=T.generateQuestions(count,seed);
    assert.equal(qs.length,count);
    assert.equal(new Set(qs.map(q=>q.kind)).size,4);
    assert.equal(new Set(qs.map(q=>q.category)).size,3);
    assert.equal(new Set(qs.map(q=>q.type+JSON.stringify(q.params))).size,count);
    assert.equal(new Set(qs.map(q=>q.type+JSON.stringify([q.paragraphs,q.code,q.pairs?.map(p=>p.left)]))).size,count);
  }
  assert.deepEqual(T.generateQuestions(12,3),T.generateQuestions(12,3));
  assert.notDeepEqual(T.generateQuestions(12,3),T.generateQuestions(12,4));
});

test('matching requires all correct pairs, text preserves case, choice stores stable IDs',()=>{
  const match=qByType('match-types');
  assert.equal(T.isAnswered(match,JSON.stringify({[match.pairs[0].id]:match.answer[match.pairs[0].id]})),false);
  assert.equal(T.checkAnswer(match,'not json'),false);
  const wrong={...match.answer,[match.pairs[0].id]:'unknown'};
  assert.equal(T.checkAnswer(match,JSON.stringify(wrong)),false);
  assert.equal(T.checkAnswer(qByType('literal-type'),'unknown'),false);
  const str=qByType('string-output');
  assert.ok(T.checkAnswer(str,str.answer+'\n'));
  assert.equal(T.checkAnswer(str,`"${str.answer}"`),false);
});

test('grades, partial matching and empty code are scored consistently',()=>{
  const s=C.createSession(profile,12,30,42,1000);
  const qs=T.generateQuestions(s.count,s.seed);
  s.answers=qs.map(q=>typeof q.answer==='object'?JSON.stringify(q.answer):q.answer);
  assert.equal(C.scoreSession(s).grade,5);
  assert.equal(C.scoreSession(s).correct,12);
  s.answers[0]='';s.answers[1]='';
  assert.equal(C.scoreSession(s).grade,4);
  assert.equal(C.scoreSession(s).correct,10);
  for(const [correct,grade]of[[0,1],[19,1],[20,2],[50,3],[70,4],[85,5]])assert.equal(C.grade(correct,100).grade,grade);
});

test('session persists code and matches, deduplicates activity, and finishes at deadline',()=>{
  const s=C.createSession(profile,12,15,42,1000);
  s.answers[0]='print("Ответ:", score)';s.answers[1]=JSON.stringify({row0:'int'});
  const copy=JSON.parse(JSON.stringify(s));
  assert.ok(C.validateSession(copy));
  assert.deepEqual(copy.answers,s.answers);
  C.beginAway(copy,'blur',2000);C.beginAway(copy,'hidden',2100);
  assert.equal(copy.events.length,1);
  C.endAway(copy,3000);assert.equal(copy.awayMs,1000);
  assert.equal(C.remainingMs(copy,901001),0);
  C.finishSession(copy,'manual',999999);
  assert.equal(copy.finishedAt,901000);assert.equal(copy.finishReason,'timeout');
  assert.ok(C.validateSession(copy));
  assert.equal(C.validateSession({...copy,answers:['oops']}),false);
});
