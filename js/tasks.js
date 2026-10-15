(function(root) {
  'use strict';
  const P = typeof module !== 'undefined' && module.exports ? require('./python.js') : root.PySandbox;
  const categories = {
    types: {label:'Типы данных',short:'Типы',icon:'types'},
    reading: {label:'Читаем код',short:'Чтение',icon:'code'},
    practice: {label:'Меняем код',short:'Практика',icon:'edit'},
  };
  const kindLabels = {choice:'Выбери ответ',text:'Определи вывод',match:'Сопоставь',code:'Измени строку'};
  const types = ['int','float','str','bool','list'];
  const typeNames = {int:'целое число',float:'вещественное число',str:'строка',bool:'логическое значение',list:'список'};
  function random(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15,t | 1); t ^= t + Math.imul(t ^ t >>> 7,t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function shuffle(items,r) { const a = [...items]; for(let i=a.length-1;i>0;i--) {const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
  const pick = (r,a) => a[Math.floor(r()*a.length)];
  const integer = (r,min,max) => min+Math.floor(r()*(max-min+1));
  const choiceTypes = r => shuffle(types.map(id=>({id,text:`${id} — ${typeNames[id]}`})),r);
  const task = (type,category,kind,title,paragraphs,extra) => ({type,category,kind,title,level:category==='practice'?'Практика':'Базовый',paragraphs,...extra});
  const words = ['кот','робот','код','школа','панда','урок','ракета','Питон'];
  const generators = [
    r => {
      const n=integer(r,2,70), word=pick(r,words), expected=pick(r,types);
      const literals={int:String(n),float:`${n}.0`,str:`"${n}"`,bool:pick(r,['True','False']),list:`[${n}, ${n+1}, ${n+2}]`};
      const literal=literals[expected];
      return task('literal-type','types','choice','Какой это тип?',[
        'В переменную value записали значение. Выбери её точный тип в Python 3.',
      ],{code:[`value = ${literal}`],choices:choiceTypes(r),answer:expected,solution:[`${literal} — ${typeNames[expected]}, тип ${expected}.`,expected==='float'?'Даже с нулевой дробной частью число с точкой имеет тип float.':expected==='str'?'Кавычки превращают запись числа в текст: арифметика потребует преобразования.':`Тип определяется значением, а не именем переменной.`],params:{n,word,expected,literal}});
    },
    r => {
      const n=integer(r,2,40), mode=integer(r,0,3);
      const cases=[{line:'x = str(x)',answer:'str',why:'str() преобразует число в строку.'},{line:'x = x / 2',answer:'float',why:'Оператор / всегда возвращает float для обычных чисел Python.'},{line:'x = x > 10',answer:'bool',why:'Сравнение возвращает True или False — значение типа bool.'},{line:'x = [x, x + 1]',answer:'list',why:'Квадратные скобки создают список.'}];
      const c=cases[mode];
      return task('changing-type','types','choice','Переменная меняет тип',[
        'Какой тип будет у переменной x после выполнения обеих строк?',
      ],{code:[`x = ${n}`,c.line],choices:choiceTypes(r),answer:c.answer,solution:[`Сначала x — целое число ${n}.`,c.why,'После присваивания x хранит новое значение; старый тип не закрепляется за именем.'],params:{n,mode}});
    },
    r => {
      const n=integer(r,2,50),word=pick(r,words);
      const literals={int:String(n),float:`${n}.5`,str:`"${word}"`,bool:pick(r,['True','False']),list:`[${n}, ${n+2}]`};
      const rows=shuffle(types,r).map((id,i)=>({id:`row${i}`,left:literals[id],expected:id}));
      return task('match-types','types','match','Значение → тип данных',[
        'Сопоставь каждое значение с его типом. Каждый тип используется ровно один раз.',
        'Задание засчитывается, когда все пять пар составлены верно.',
      ],{pairs:rows.map(({id,left})=>({id,left})),options:choiceTypes(r),answer:Object.fromEntries(rows.map(row=>[row.id,row.expected])),solution:rows.map(row=>`${row.left} → ${row.expected}: ${typeNames[row.expected]}.`),params:{n,word,rows}});
    },
    r => {
      const defs=[['input','Считывает введённый текст как строку'],['int','Преобразует подходящее значение в целое число'],['float','Преобразует подходящее значение в вещественное число'],['str','Получает строковое представление значения'],['bool','Получает логическое значение True или False'],['len','Возвращает длину строки или списка']];
      const chosen=shuffle(defs,r).slice(0,4);
      const pairs=shuffle(chosen,r).map(([name],i)=>({id:`row${i}`,left:`${name}()`,expected:name}));
      return task('match-functions','types','match','Функция → действие',[
        'Подбери описание для каждой функции. Каждое описание используется один раз.',
        'Для одного балла нужно правильно составить все четыре пары.',
      ],{pairs:pairs.map(({id,left})=>({id,left})),options:shuffle(chosen.map(([id,text])=>({id,text})),r),answer:Object.fromEntries(pairs.map(p=>[p.id,p.expected])),solution:pairs.map(p=>`${p.left} — ${defs.find(d=>d[0]===p.expected)[1].toLowerCase()}.`),params:{pairs}});
    },
    r => {
      const a=integer(r,11,59),b=integer(r,2,8),mode=integer(r,0,2);
      const expr=mode===0?'a // b':mode===1?'a % b':'a + b * 2';
      const answer=mode===0?Math.floor(a/b):mode===1?a%b:a+b*2;
      return task('arithmetic-output','reading','text','Что напечатает программа?',[
        'Выполни код мысленно. Запиши число, которое появится на экране.',
      ],{code:[`a = ${a}`,`b = ${b}`,`print(${expr})`],answer:String(answer),solution:[mode===0?'// — целочисленное деление: для положительных чисел берём целую часть частного.':mode===1?'% — остаток от деления.':'Умножение выполняется раньше сложения.',`${expr.replace(/a/g,String(a)).replace(/b/g,String(b))} = ${answer}.`],params:{a,b,mode}});
    },
    r => {
      const word=pick(r,words),n=integer(r,2,4),sep=pick(r,['!','?','.']);
      return task('string-output','reading','text','Строки тоже умеют складываться',[
        'Запиши вывод программы без внешних кавычек. Сохрани символы и регистр букв.',
      ],{code:[`word = "${word}"`,`print(word * ${n} + "${sep}")`],answer:word.repeat(n)+sep,solution:[`Умножение строки на ${n} повторяет её ${n} раза без пробелов.`,`Знак + присоединяет строку "${sep}".`,`На экране: ${word.repeat(n)+sep}`],params:{word,n,sep}});
    },
    r => {
      const a=integer(r,1,20),b=integer(r,3,17),mode=integer(r,0,2);
      const expr=mode===0?'a > b and a != 10':mode===1?'a < b or a == 10':'not (a == b)';
      const result=mode===0?a>b&&a!==10:mode===1?a<b||a===10:a!==b;
      return task('boolean-output','reading','choice','True или False?',[
        'Выбери результат, который выведет программа. Обрати внимание на логические операции.',
      ],{code:[`a = ${a}`,`b = ${b}`,`print(${expr})`],choices:shuffle([{id:'True',text:'True'},{id:'False',text:'False'}],r),answer:result?'True':'False',solution:[`a = ${a}, b = ${b}.`,mode===0?'and даёт True, только когда оба условия истинны.':mode===1?'or даёт True, если истинно хотя бы одно условие.':'not меняет True на False и наоборот.',`Итог: ${result?'True':'False'}.`],params:{a,b,mode}});
    },
    r => {
      const n=integer(r,1,25),step=integer(r,2,5),at=integer(r,0,3);
      const list=Array.from({length:4},(_,i)=>n+i*step);
      return task('list-output','reading','text','Найди элемент списка',[
        'Что выведет программа? Запиши одно число. В Python индексы начинаются с нуля.',
      ],{code:[`scores = [${list.join(', ')}]`,`print(scores[${at}])`],answer:String(list[at]),solution:[`Индекс ${at} указывает на элемент с порядковым номером ${at+1}.`,`Элемент scores[${at}] равен ${list[at]}.`],params:{list,at}});
    },
    r => {
      const initial=integer(r,7,15),delta=integer(r,1,5);
      return task('fix-input','practice','code','Исправь: число пришло строкой',[
        `Программа должна прочитать целый возраст и вывести, сколько лет будет через ${delta} лет. Сейчас возникает ошибка.`,
        'Исправь только строку 1. Программа должна работать с любым целым возрастом из проверки.',
      ],{code:['age = input()',`print(age + ${delta})`],editLine:0,answer:'age = int(input())',sampleInput:[String(initial)],sampleOutput:String(initial+delta),tests:[initial,initial+3,1,42].map(n=>({input:[String(n)],output:String(n+delta)})),solution:['input() всегда возвращает строку.','int(input()) превращает запись целого числа в int.','Исправленная строка: age = int(input())',`После исправления программа складывает два числа. Для ввода ${initial} получаем ${initial+delta}.`],params:{initial,delta}});
    },
    r => {
      const initial=integer(r,5,60),label=pick(r,['Баллы','Очки','Результат']);
      return task('fix-string-number','practice','code','Исправь: текст и число',[
        `Нужно вывести текст «${label}: » и введённое целое число. Например, при вводе ${initial}: ${label}: ${initial}`,
        'Исправь только строку 2. Между двоеточием и числом должен быть один пробел. Значение score может меняться.',
      ],{code:['score = int(input())',`print("${label}: " + score)`],editLine:1,answer:`print("${label}: " + str(score))`,sampleInput:[String(initial)],sampleOutput:`${label}: ${initial}`,tests:[initial,0,107,-3].map(n=>({input:[String(n)],output:`${label}: ${n}`})),solution:['Складывать строку и число напрямую нельзя.','str(score) получает текстовое представление числа.',`Один вариант: print("${label}: " + str(score))`,`Другой вариант: print("${label}:", score). print() вставляет пробел между аргументами.`],params:{initial,label}});
    },
    r => {
      const a=integer(r,2,12),b=integer(r,2,10),mode=pick(r,['area','perimeter']);
      const expected=(x,y)=>mode==='area'?x*y:2*(x+y);
      return task('change-formula','practice','code',mode==='area'?'Измени код: площадь':'Измени код: периметр',[
        `Программа читает две положительные целые стороны прямоугольника. Измени её, чтобы она выводила ${mode==='area'?'площадь':'периметр'}.`,
        'Измени только строку 3. Используй переменные a и b: стороны в проверках будут разными.',
      ],{code:['a = int(input())','b = int(input())','print(a + b)'],editLine:2,answer:mode==='area'?'print(a * b)':'print(2 * (a + b))',sampleInput:[String(a),String(b)],sampleOutput:String(expected(a,b)),tests:[[a,b],[2,7],[9,3],[1,4]].map(([x,y])=>({input:[String(x),String(y)],output:String(expected(x,y))})),solution:[mode==='area'?'Площадь прямоугольника S = a × b.':'Периметр прямоугольника P = 2 × (a + b).',mode==='area'?'Нужна строка print(a * b).':'Нужна строка print(2 * (a + b)).',`При a = ${a} и b = ${b} ответ: ${expected(a,b)}.`],params:{a,b,mode}});
    },
    r => {
      const word=pick(r,words),count=integer(r,2,5),sep=pick(r,['!','?']);
      return task('change-string','practice','code','Измени код: собери строку',[
        `Программа читает слово. Измени вывод: слово нужно повторить ${count} раза подряд без пробелов и добавить один знак «${sep}» в самом конце.`,
        'Измени только строку 2. Программа должна работать с любым введённым словом.',
      ],{code:['word = input()','print(word)'],editLine:1,answer:`print(word * ${count} + "${sep}")`,sampleInput:[word],sampleOutput:word.repeat(count)+sep,tests:[word,'ИТ','a','Python'].map(w=>({input:[w],output:w.repeat(count)+sep})),solution:[`word * ${count} повторяет строку ${count} раза.`,`+ "${sep}" добавляет один знак после всех повторений.`,`Пример решения: print(word * ${count} + "${sep}")`],params:{word,count,sep}});
    },
  ];
  function generateQuestions(count,seed) {
    if (!Number.isInteger(count) || count<1 || count>100) throw new RangeError('Invalid count');
    const r=random(seed),result=[],seen=new Set();
    while(result.length<count) {
      // At eight or more tasks each format is included, including matching and code editing.
      const groups=[generators.slice(0,4),generators.slice(4,8),generators.slice(8,12)].map(g=>shuffle(g,r));
      const round=[];
      for(let i=0;i<4;i++)round.push(...shuffle(groups.map(g=>g[i]),r));
      for(const fn of round) {
        let q,key; let tries=0;
        do {q=fn(r);key=q.type+JSON.stringify([q.paragraphs,q.code,q.pairs?.map(p=>p.left)]);if(++tries>1000)throw new Error('Cannot generate unique question');}while(seen.has(key));
        seen.add(key);result.push(q);if(result.length===count)break;
      }
    }
    if(count>=8) {
      for(const [kind,index] of [['choice',0],['match',2],['text',4],['code',8]]) {
        if(result.some(q=>q.kind===kind))continue;
        const replace=result.findIndex(q=>result.filter(x=>x.kind===q.kind).length>1 && result.filter(x=>x.category===q.category).length>1);
        result[replace]=generators[index](r);
      }
    }
    return shuffle(result,r).map((q,i)=>({...q,id:`${seed}-${i}`}));
  }
  function parsePairs(input) { try {const v=JSON.parse(input);return v && typeof v==='object' && !Array.isArray(v)?v:{};}catch{return {};} }
  function isAnswered(q,input) {
    if(typeof input!=='string' || !input.trim())return false;
    if(q.kind==='match') {const map=parsePairs(input);return q.pairs.every(p=>q.options.some(o=>o.id===map[p.id]));}
    if(q.kind==='choice')return q.choices.some(c=>c.id===input);
    return true;
  }
  function programFor(q,input) {
    if(typeof input!=='string' || !input.trim() || /[\r\n]/.test(input) || input.length>500)return null;
    const code=[...q.code];code[q.editLine]=input.trim();return code.join('\n');
  }
  function checkAnswer(q,input) {
    if(!isAnswered(q,input))return false;
    if(q.kind==='match') {const map=parsePairs(input);return q.pairs.every(p=>map[p.id]===q.answer[p.id]);}
    if(q.kind==='code') {
      const source=programFor(q,input);if(source===null)return false;
      return q.tests.every(t=>{const r=P.run(source,t.input);return r.ok && r.output===t.output;});
    }
    return input.replace(/\r\n?/g,'\n').trim()===String(q.answer);
  }
  function answerText(q,input) {
    if(q.kind==='match') {const map=typeof input==='string'?parsePairs(input):input;return q.pairs.map(p=>`${p.left} → ${q.options.find(o=>o.id===map?.[p.id])?.text || '—'}`).join('\n');}
    if(q.kind==='choice')return q.choices.find(o=>o.id===input)?.text || '—';
    return String(input||'—');
  }
  const api={categories,kindLabels,generators,generateQuestions,random,shuffle,parsePairs,isAnswered,programFor,checkAnswer,answerText};
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  root.PythonTasks=api;
})(globalThis);
