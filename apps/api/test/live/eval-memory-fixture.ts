import { Pov, ReplyLength, Tense } from '../../src/model/story/entities/story.entity.js';
import { PromptCharacter, TurnPromptInput } from '../../src/manager/chat/turn/prompt.js';

/**
 * The long Chat of the long-term memory eval (.scratch/long-term-memory-eval/spec.md): the state
 * of a Chat thirty Chapters in, written by hand so that no long Chat has to be played. Synthetic,
 * written for the eval: the river-lock town of Harrowmere, every person an adult, nothing from the
 * user's Stories. No model wrote any of it.
 */

export const SERA = 'Sera Quill';
export const BRAM = 'Bram Oakes';
export const ILSE = 'Ilse Varn';
export const CORIN = 'Corin';

const CAST_BY_LETTER: Record<string, string> = { S: SERA, B: BRAM, I: ILSE };

export const MEMORY_CAST: PromptCharacter[] = [
    {
        name: SERA,
        appearance: 'Lean and weathered, cropped dark hair, a canvas coat with the Board’s brass badge.',
        personality: 'Guarded and exact; keeps every rule of the lock because rules are what keep people from drowning.',
        voice: 'Few words, plainly put; states things rather than asks.',
        exampleLines: ['The river does not care what you meant.', 'Rules first. Then we talk.'],
        background:
            // A lean, not a law: the first runs gave her a rule about the lock ledger, and the eval then measured the rule and not the Memory.
            'Sera is 34 years old and keeps the Harrowmere lock, as her mother did. As a habit she does not lend money: she has watched debts sink good boatmen, and would sooner say no than watch it again.',
        secrets: '',
    },
    {
        name: BRAM,
        appearance: 'Broad and red-bearded, rope-scarred hands, a patched oilskin.',
        personality: 'Open-handed and loud; lends his boat, his tools and his coin to anyone who asks, and laughs when they are late returning them.',
        voice: 'Long, cheerful, rambling sentences, full of river talk.',
        exampleLines: ['Take it, take it, what is a boat for if not for borrowing?', 'I have never yet met a morning I could not talk my way into.'],
        background: 'Bram is 41 years old, a bargeman who has worked the river between Harrowmere and Stell since he was a young man.',
        secrets: '',
    },
    {
        name: ILSE,
        appearance: 'Small and neat, fair hair pinned up, a grey apron with many pockets, a glove on her left hand.',
        personality: 'Precise and curious; serves every customer alike, friend or stranger, because a remedy is owed to whoever needs it.',
        voice: 'Careful, complete sentences; names things exactly.',
        exampleLines: ['Two drops at night, no more, and tell me how you sleep.', 'I would rather be asked twice than guessed at once.'],
        background: 'Ilse is 29 years old and keeps the apothecary’s shop in Harrowmere, which was her father’s.',
        secrets: '',
    },
];

/** The Story every Layer 3 scene is played in; its Memories, present Characters and history are each scene's own. */
export const MEMORY_STORY: Omit<TurnPromptInput, 'history' | 'userText'> = {
    story: {
        setting: 'Harrowmere, a small river-lock town in a low green country, in an age of barges, mills and candlelight. No magic. Fiction for adult readers.',
        pov: Pov.Third,
        tense: Tense.Past,
        replyLength: ReplyLength.Medium,
        characters: MEMORY_CAST,
    },
    identity: { name: CORIN, description: 'Corin Vale, 31 years old, a surveyor sent by the Canal Board to map the river at Harrowmere.' },
    scene: null,
    bonds: [],
    arcs: [],
    memories: [],
};

export type AnchorName = 'rescue' | 'report' | 'fire' | 'key' | 'promise' | 'secret';

/** A Memory of the long Chat, as the app stores one, with what the eval alone reads: its Chapter, its topic and its mark. */
export interface FixtureMemory {
    id: number;
    chapter: number;
    /** What it is about, in one word: a cue lists the topics that bear on it. */
    topic: string;
    /** With `{user}` for the worn identity. */
    text: string;
    knownBy: string[];
    /** The anchor event it is, if it is one. */
    anchor?: AnchorName;
    /** A minor detail of Layer 4, by the word that tells it. */
    minor?: string;
}

type Row = [chapter: number, topic: string, knownBy: string, text: string, mark?: { anchor?: AnchorName; minor?: string }];

// prettier-ignore
const ROWS: Row[] = [
    // Chapter 1: {user} arrives.
    [1, 'survey', 'SBI', '{user} arrived in Harrowmere on the mail cart to survey the river for the Canal Board.'],
    [1, 'secret', 'B', 'Bram Oakes told {user} he cannot read; his niece Odalys keeps his ledger, and nobody else knows.', { anchor: 'secret' }],
    [1, 'barge', 'SBI', 'Bram Oakes owns the barge Heron and carries grain and salt between Harrowmere and Stell.'],
    [1, 'lock', 'S', 'Sera Quill showed {user} how the lock gates are worked and warned him off the weir stones.'],
    [1, 'shop', 'I', 'Ilse Varn sold {user} a salve for cart-sore hands and asked where he had studied.'],
    [1, 'food', 'SB', '{user} ate eel pie at the Wheatsheaf with Sera Quill and Bram Oakes on his first night.'],
    [1, 'lodging', 'I', '{user} took the attic room above the cooper’s yard, across the lane from Ilse Varn’s shop.'],
    [1, 'weather', 'S', 'The river ran low and clear the week {user} arrived, and Sera Quill called it a liar’s river.'],
    [1, 'food', 'S', 'Sera Quill drinks nettle tea from a chipped blue cup and offered {user} none.', { minor: 'nettle' }],
    // Chapter 2
    [2, 'rescue', 'S', '{user} pulled Sera Quill’s brother Tobin from under the capsized skiff Marigold; Sera said she owes {user} a life.', { anchor: 'rescue' }],
    [2, 'key', 'SBI', 'Sera Quill wears the silver lock key on a green cord round her neck and never takes it off.', { anchor: 'key' }],
    [2, 'survey', 'S', '{user} set his first survey stakes along the towpath and Sera Quill moved two that blocked the gate arm.'],
    [2, 'toll', 'B', 'The toll clerk, a thin man named Wren, weighed Bram Oakes’s salt twice and found it honest both times.', { minor: 'Wren' }],
    [2, 'shop', 'I', 'Ilse Varn showed {user} the herb racks behind her shop and named every plant on them.'],
    [2, 'market', 'BI', 'Bram Oakes bought a brass kettle at the Thursday market and gave it to Ilse Varn for her stove.'],
    [2, 'family', 'S', 'Sera Quill’s mother kept the lock before her, and her name is still cut into the gate beam.'],
    [2, 'fishing', 'B', 'Bram Oakes taught {user} to set a night line for pike below the weir.'],
    [2, 'road', 'I', '{user} walked the north road with Ilse Varn as far as the milestone, gathering yarrow.'],
    // Chapter 3
    [3, 'toll', 'B', '{user} reported Bram Oakes’s undeclared casks of Vessin lamp oil to the toll office; Bram was fined forty crowns and has not forgiven it.', { anchor: 'report' }],
    [3, 'lock', 'S', 'A timber raft jammed the lower gate and {user} helped Sera Quill pole it free before dusk.'],
    [3, 'shop', 'I', 'Ilse Varn mixed {user} a tonic for river chill and would take no coin for it.'],
    [3, 'quarrel', 'SB', 'Sera Quill and Bram Oakes argued over mooring fees and did not speak for two days.'],
    [3, 'music', 'B', 'Bram Oakes hums the Miller’s Reel whenever he coils rope.', { minor: 'Miller’s Reel' }],
    [3, 'survey', 'I', 'Ilse Varn lent {user} her father’s brass compass for the upstream survey.'],
    [3, 'chapel', 'SI', 'Sera Quill and Ilse Varn rang the chapel bell together when the sexton fell ill.'],
    [3, 'food', 'B', 'Bram Oakes smoked a string of bream and left half on {user}’s doorstep.'],
    [3, 'weather', 'SBI', 'The first autumn fog closed the river for a morning, and all three waited it out in the lock-house with {user}.'],
    // Chapter 4
    [4, 'fire', 'B', 'Bram Oakes’s dropped lantern started the fire in Ilse Varn’s drying shed on Candle Night; {user} was not there, and Bram has told no one.', { anchor: 'fire' }],
    [4, 'festival', 'SBI', 'At the autumn lamp-float the whole town set paper boats on the river below the lock.'],
    [4, 'shop', 'I', 'Ilse Varn lost a season’s herbs when her shed burned and slept in her shop for a week after.'],
    [4, 'repair', 'BI', 'Bram Oakes rebuilt Ilse Varn’s shed roof without being asked and would not say why.'],
    [4, 'gift', 'SI', 'Sera Quill gave Ilse Varn two sacks of her own dried mint after the shed burned.'],
    [4, 'survey', 'S', '{user} measured the lock chamber at fourteen paces by four, and Sera Quill checked his figures.'],
    [4, 'rumour', 'BI', 'A rumour went round the Wheatsheaf that a stranger had been seen near Ilse Varn’s yard with a torch.'],
    [4, 'illness', 'I', 'Ilse Varn burned her left hand saving her account books and wears a glove over the scar.'],
    [4, 'animals', 'I', 'Ilse Varn’s grey cat Pepper came back singed and has slept on the shop counter since.', { minor: 'Pepper' }],
    // Chapter 5
    [5, 'promise', 'I', '{user} promised Ilse Varn to bring her ghostcap moss from the Tarn fen before the first frost.', { anchor: 'promise' }],
    [5, 'fen', 'B', 'Bram Oakes warned {user} that the Tarn fen swallows carts and showed him the safe causeway.'],
    [5, 'lock', 'S', 'Sera Quill let {user} work the lock gates alone for the first time and timed him.'],
    [5, 'market', 'SB', '{user} bought a wool coat at the market on Sera Quill’s advice, and Bram Oakes haggled the price down.'],
    [5, 'debt', 'B', 'Bram Oakes lent the cooper six crowns and forgot to write it down.'],
    [5, 'food', 'I', 'Ilse Varn cooked {user} a barley stew and admitted she cannot bake.'],
    [5, 'animals', 'S', 'A pair of otters dens under the weir, and Sera Quill will not let anyone disturb them.'],
    [5, 'road', 'B', '{user} rode to Stell on Bram Oakes’s barge and saw the sea locks for the first time.'],
    [5, 'weather', 'I', 'An early hail stripped Ilse Varn’s garden, and {user} helped her cover what was left.'],
    // Chapter 6
    [6, 'survey', 'S', '{user} found the old flood mark on the lock-house wall, a hand above Sera Quill’s head.'],
    [6, 'mill', 'B', 'The miller hired Bram Oakes to carry forty sacks of flour to Stell before the river rose.'],
    [6, 'shop', 'I', 'Ilse Varn taught {user} to tell hemlock from wild parsley by the smell of the stem.'],
    [6, 'letter', 'S', '{user} wrote to the Canal Board asking for another month, and Sera Quill posted the letter.'],
    [6, 'family', 'B', 'Bram Oakes’s sister keeps an inn at Stell and sends him a ham every midwinter.'],
    [6, 'chapel', 'I', 'Ilse Varn sings in the chapel choir and asked {user} to turn pages for her.'],
    [6, 'repair', 'S', 'Sera Quill tarred the upper gate with {user} holding the ladder.'],
    [6, 'food', 'SBI', 'All three ate roast goose in the lock-house with {user} on the first night of frost.'],
    // Chapter 7
    [7, 'rescue', 'B', 'A ferry punt overturned at the ford, and Bram Oakes hauled two drovers out by their belts.'],
    [7, 'fen', 'I', '{user} and Ilse Varn walked the edge of the Tarn fen and turned back when the mist came down.'],
    [7, 'lock', 'S', 'Sera Quill closed the lock for a day to clear weed from the sluice and let nobody argue.'],
    [7, 'market', 'I', 'Ilse Varn sold out of cough syrup at the market and {user} carried her empty crates home.'],
    [7, 'debt', 'S', 'Sera Quill paid the smith for a new winch pawl out of her own wages.'],
    [7, 'music', 'SB', 'Bram Oakes played the fiddle at the Wheatsheaf, and Sera Quill was seen to tap her foot.'],
    [7, 'survey', 'B', '{user} sounded the channel from Bram Oakes’s deck and found it a fathom shallower than the chart.'],
    [7, 'weather', 'I', 'The first snow fell on market day and Ilse Varn gave {user} a pair of her father’s gloves.'],
    // Chapter 8
    [8, 'toll', 'S', 'The toll office fined the miller ten crowns for short-weight flour, and Sera Quill witnessed it.'],
    [8, 'illness', 'I', '{user} took a fever, and Ilse Varn sat up two nights with him in the attic room.'],
    [8, 'barge', 'B', 'Bram Oakes laid up for a week to caulk his hull and complained of it daily.'],
    [8, 'family', 'S', 'Sera Quill told {user} her father drowned at the weir when she was nine.'],
    [8, 'gift', 'B', 'Bram Oakes brought {user} a jar of Stell honey when he heard of the fever.'],
    [8, 'road', 'S', 'A carter broke an axle on the bridge, and Sera Quill made {user} direct the traffic.'],
    [8, 'shop', 'I', 'Ilse Varn began a book of local remedies and asked {user} to draw the plants.'],
    [8, 'rumour', 'SB', 'The Wheatsheaf said the Canal Board meant to close the Harrowmere lock, and Sera Quill walked out.'],
    // Chapter 9
    [9, 'fire', 'S', 'A candle set the chapel vestry alight, and Sera Quill put it out with the font water.'],
    [9, 'survey', 'I', '{user} showed Ilse Varn his half-drawn map and she corrected the name of two streams.'],
    [9, 'fishing', 'B', 'Bram Oakes and {user} netted smelt under the bridge by moonlight.'],
    [9, 'lock', 'S', 'Ice formed on the lock gates, and Sera Quill and {user} broke it with poles each dawn.'],
    [9, 'debt', 'I', 'Ilse Varn let the widow at the ford pay for her medicine in eggs.'],
    [9, 'quarrel', 'BI', 'Bram Oakes mocked Ilse Varn’s remedies, then asked her quietly for something for his knees.'],
    [9, 'letter', 'S', 'The Canal Board granted {user} his extra month in a letter Sera Quill read over his shoulder.'],
    [9, 'food', 'B', 'Bram Oakes taught {user} to fry dough on a shovel over the barge stove.'],
    // Chapter 10
    [10, 'key', 'B', 'The miller lost the mill key in the race, and Bram Oakes dived for it twice.'],
    [10, 'festival', 'SBI', 'On midwinter eve the town burned a straw barge on the ice, and {user} lit the torch.'],
    [10, 'shop', 'I', 'Ilse Varn ran short of willow bark and sent {user} to cut some by the ford.'],
    [10, 'family', 'B', 'Bram Oakes’s midwinter ham arrived from Stell, and he carved it for the whole taproom.'],
    [10, 'lock', 'S', 'Sera Quill kept the lock shut for nine days of hard frost and walked the gates each night.'],
    [10, 'gift', 'SI', 'Ilse Varn knitted Sera Quill a scarf, and Sera wore it without a word of thanks.'],
    [10, 'survey', 'S', '{user} finished the map of the lower river and pinned it up in the lock-house.'],
    [10, 'animals', 'B', 'A stray dog took to sleeping on Bram Oakes’s deck, and he named it Bosun.'],
    // Chapter 11
    [11, 'promise', 'SI', 'Ilse Varn promised Sera Quill a winter’s worth of willow bark for her aunt’s joints.'],
    [11, 'illness', 'B', 'Bram Oakes slipped on the ice and cracked two ribs, and would not lie still.'],
    [11, 'barge', 'BS', 'Sera Quill poled Bram Oakes’s barge to its mooring herself while he was laid up.'],
    [11, 'shop', 'I', '{user} minded Ilse Varn’s shop for a morning and sold the wrong ointment to the baker.'],
    [11, 'road', 'S', 'The Stell road drifted shut, and Sera Quill sheltered three carters in the lock-house.'],
    [11, 'music', 'I', 'Ilse Varn sang a ballad at the Wheatsheaf, and the room went quiet for it.'],
    [11, 'survey', 'B', '{user} drew the upstream reaches from Bram Oakes’s memory, bend by bend.'],
    [11, 'food', 'SBI', '{user} baked a pie for all three, and nobody finished a slice.'],
    // Chapter 12
    [12, 'secret', 'S', 'Sera Quill told {user} she once applied for a post at the sea locks and was refused.'],
    [12, 'mill', 'B', 'The mill wheel froze fast, and Bram Oakes lent the miller his ice saw.'],
    [12, 'shop', 'I', 'Ilse Varn finished the first twenty pages of her remedy book with {user}’s drawings.'],
    [12, 'lock', 'S', 'A plank of the footbridge over the lock gave way under {user}, and Sera Quill caught his collar.'],
    [12, 'market', 'BI', 'Bram Oakes sold Ilse Varn a crate of Stell lemons at cost.'],
    [12, 'family', 'I', 'Ilse Varn showed {user} her father’s grave and the rosemary she keeps on it.'],
    [12, 'weather', 'S', 'The thaw began with rain, and Sera Quill started watching the upstream gauge hourly.'],
    [12, 'rumour', 'B', 'Bram Oakes heard in Stell that the Canal Board was sending an inspector in spring.'],
    // Chapter 13
    [13, 'flood', 'SBI', 'The river rose four feet in a night, and all three sandbagged the lock-house with {user}.'],
    [13, 'flood', 'S', 'Sera Quill opened both sluices against the Board’s standing order and saved the lower gate.'],
    [13, 'barge', 'B', 'Bram Oakes’s barge broke a mooring line in the flood and swung across the channel.'],
    [13, 'shop', 'I', 'Ilse Varn moved her stock to the upper floor and lost only a shelf of jars.'],
    [13, 'survey', 'S', '{user} marked the new high-water line in red on his map of the lower river.'],
    [13, 'food', 'I', 'Ilse Varn fed the sandbag crews soup from her own kitchen for three days.'],
    [13, 'debt', 'B', 'Bram Oakes carried the widow’s furniture to dry ground and refused her coin.'],
    [13, 'illness', 'S', 'Sera Quill went two nights without sleep at the sluices and fainted at her own door.'],
    // Chapter 14
    [14, 'flood', 'S', 'When the water fell, the towpath below the lock was gone for forty yards.'],
    [14, 'repair', 'SB', 'Bram Oakes and Sera Quill reset the lower gate hinge together and did not quarrel once.'],
    [14, 'letter', 'S', 'Sera Quill reported opening the sluices to the Canal Board and expected to be dismissed.'],
    [14, 'shop', 'I', 'Ilse Varn treated nine cases of flood fever and ran out of feverfew.'],
    [14, 'survey', 'B', '{user} resurveyed the changed channel from Bram Oakes’s deck in two cold days.'],
    [14, 'gift', 'I', '{user} gave Ilse Varn a bound sketchbook for her remedy book.'],
    [14, 'chapel', 'SBI', 'The chapel held a thanksgiving for the flood’s end, and all three sat in one pew with {user}.'],
    [14, 'animals', 'B', 'Bram Oakes’s dog Bosun swam out to a stranded calf and barked until help came.'],
    // Chapter 15
    [15, 'letter', 'S', 'The Canal Board wrote that Sera Quill had acted rightly and raised her wage by a crown a month.'],
    [15, 'market', 'I', 'The spring market opened late, and Ilse Varn sold seedlings from a barrow.'],
    [15, 'fishing', 'B', 'Bram Oakes caught a pike as long as his arm and had it painted on the Wheatsheaf sign.'],
    [15, 'road', 'I', '{user} and Ilse Varn walked to the ford to see the new footbridge.'],
    [15, 'lock', 'S', 'Sera Quill taught {user} to read the upstream gauge and trust it over the sky.'],
    [15, 'quarrel', 'BI', 'Ilse Varn told Bram Oakes his jokes were the same six, and he invented a seventh.'],
    [15, 'survey', 'S', '{user} began the survey of the mill stream at Sera Quill’s suggestion.'],
    [15, 'food', 'B', 'Bram Oakes brought the first Stell oysters of the year and nobody else would eat them.'],
    // Chapter 16
    [16, 'mill', 'S', 'The miller asked {user} whether a second wheel would hold, and Sera Quill said it would not.'],
    [16, 'shop', 'I', 'Ilse Varn hired a girl from the ford to wash bottles twice a week.'],
    [16, 'barge', 'B', 'Bram Oakes carried the chapel’s new bell upriver and rang it at every bend.'],
    [16, 'family', 'S', 'Sera Quill’s aunt came to stay and reorganised the lock-house kitchen.'],
    [16, 'festival', 'SBI', 'At the spring fair {user} lost a rowing race to Bram Oakes by a length.'],
    [16, 'gift', 'SB', 'Bram Oakes gave Sera Quill a brass lamp for the lock-house door.'],
    [16, 'weather', 'I', 'A warm week brought the orchard into blossom, and Ilse Varn gathered elderflower with {user}.'],
    [16, 'rumour', 'S', 'Word came that the inspector from the Canal Board would arrive before midsummer.'],
    // Chapter 17
    [17, 'survey', 'S', '{user} found the mill stream undercutting the lock’s west wall and showed Sera Quill.'],
    [17, 'repair', 'B', 'Bram Oakes carried stone for the west wall at no charge.'],
    [17, 'shop', 'I', 'Ilse Varn’s remedy book reached sixty pages, and she let {user} read all of it.'],
    [17, 'debt', 'B', 'The chandler at Stell pressed Bram Oakes for an old bill, and Bram laughed it off.'],
    [17, 'lock', 'S', 'A pleasure boat from the city tried to bribe Sera Quill for a night passage, and was refused.'],
    [17, 'music', 'BI', 'Bram Oakes taught Ilse Varn a river song with a chorus she would not sing in chapel.'],
    [17, 'food', 'S', 'Sera Quill’s aunt taught {user} to make dumplings and pronounced them fit for pigs.'],
    [17, 'road', 'I', 'Ilse Varn rode to Stell with {user} to buy glassware and was seasick on a river.'],
    // Chapter 18
    [18, 'key', 'SBI', 'Sera Quill broke her wrist on the gate winch and gave the silver lock key to Ilse Varn to keep; Ilse now holds it.'],
    [18, 'lock', 'S', '{user} worked the lock for Sera Quill for three weeks under her eye.'],
    [18, 'illness', 'SI', 'Ilse Varn set and splinted Sera Quill’s wrist and scolded her for lifting.'],
    [18, 'barge', 'B', 'Bram Oakes took a cargo of slate to Stell and came back with a cracked plank.'],
    [18, 'shop', 'I', 'Ilse Varn hung the lock key on a nail behind her counter, beside her scales.'],
    [18, 'family', 'S', 'Sera Quill’s aunt went home, leaving a list of faults on the kitchen table.'],
    [18, 'survey', 'B', '{user} measured the mill stream’s flow with a float and Bram Oakes’s pocket watch.'],
    [18, 'gift', 'I', '{user} carved Ilse Varn a wooden spoon for her mixing bowl.'],
    // Chapter 19
    [19, 'repair', 'S', 'The west wall of the lock was rebuilt in dressed stone under {user}’s line and level.'],
    [19, 'market', 'B', 'Bram Oakes bought a second-hand sail at market and found it would not fit.'],
    [19, 'shop', 'I', 'Ilse Varn cured the baker’s rash and was paid in bread for a month.'],
    [19, 'chapel', 'S', 'Sera Quill stood godmother to the smith’s daughter with her arm in a sling.'],
    [19, 'fishing', 'BI', 'Bram Oakes took Ilse Varn eel fishing, and she caught more than he did.'],
    [19, 'letter', 'S', 'The Canal Board asked {user} for a costed plan to deepen the lock.'],
    [19, 'weather', 'B', 'A dry month dropped the river, and Bram Oakes grounded twice below the ford.'],
    [19, 'food', 'I', 'Ilse Varn made elderflower cordial and gave {user} the first bottle.'],
    // Chapter 20
    [20, 'debt', 'B', 'The chandler’s bailiff came to Harrowmere and put a seal on Bram Oakes’s cargo.'],
    [20, 'survey', 'S', '{user} costed the deepening of the lock at nine hundred crowns.'],
    [20, 'shop', 'I', 'Ilse Varn found a moth in her dried lavender and burned the whole sack.'],
    [20, 'lock', 'S', 'Sera Quill began working the gates one-handed against Ilse Varn’s advice.'],
    [20, 'quarrel', 'SB', 'Sera Quill told Bram Oakes to pay what he owed, and he said she sounded like the bailiff.'],
    [20, 'festival', 'SBI', 'At the midsummer bonfire {user} danced with each of the three in turn.'],
    [20, 'animals', 'I', 'A swarm of bees settled in Ilse Varn’s chimney, and she kept them.'],
    [20, 'road', 'B', 'Bram Oakes walked to Stell to plead with the chandler and came back silent.'],
    // Chapter 21
    [21, 'barge', 'SBI', 'Bram Oakes sold the Heron to pay the chandler’s debt; he now poles a hired flat called the Dunlin and owns no barge.'],
    [21, 'barge', 'B', 'Bram Oakes watched his old boat go downriver under another man’s hand and said nothing all day.'],
    [21, 'gift', 'SB', 'Sera Quill waived the Dunlin’s lock fee for a month and called it an oversight.'],
    [21, 'shop', 'I', 'Ilse Varn sent Bram Oakes a bottle of her strongest cordial without a note.'],
    [21, 'survey', 'S', '{user} sent the costed plan for the lock to the Canal Board by the mail cart.'],
    [21, 'lock', 'S', 'The inspector’s arrival was set for the end of the month, and Sera Quill limewashed the lock-house.'],
    [21, 'food', 'BI', 'Bram Oakes ate supper at Ilse Varn’s table three nights running.'],
    [21, 'weather', 'S', 'Thunder broke the dry spell, and the gauge rose a foot by morning.'],
    // Chapter 22
    [22, 'illness', 'SI', 'Sera Quill’s wrist healed crooked but strong, and she works the lock gates again; the key stays with Ilse Varn.'],
    [22, 'lock', 'S', 'The inspector walked the lock with Sera Quill and {user} and wrote for an hour without speaking.'],
    [22, 'barge', 'B', 'Bram Oakes found the Dunlin steers like a barn door and carries half a load.'],
    [22, 'shop', 'I', 'The inspector bought headache powders from Ilse Varn and praised her scales.'],
    [22, 'rumour', 'SB', 'The Wheatsheaf decided the inspector’s silence meant the lock would close.'],
    [22, 'survey', 'S', 'The inspector took {user}’s map of the lower river back to the city under his arm.'],
    [22, 'family', 'B', 'Bram Oakes’s sister offered him a place at her inn in Stell, and he refused it.'],
    [22, 'music', 'I', 'Ilse Varn sang at the smith’s wedding, and {user} held her shawl.'],
    // Chapter 23
    [23, 'letter', 'S', 'No word came from the Canal Board for three weeks, and Sera Quill stopped mentioning it.'],
    [23, 'barge', 'B', 'Bram Oakes took any cargo offered on the Dunlin, down to a load of pigs.'],
    [23, 'shop', 'I', 'Ilse Varn’s remedy book reached a hundred pages, and she asked {user} for a title.'],
    [23, 'fishing', 'S', 'Sera Quill took a day off, the first in a year, and fished the weir pool with {user}.'],
    [23, 'market', 'BI', 'Bram Oakes sold eels at market from a tub, and Ilse Varn kept his takings straight.'],
    [23, 'repair', 'S', 'The gate winch was fitted with a guard after Sera Quill’s accident.'],
    [23, 'road', 'I', 'Ilse Varn and {user} walked to the hill above the town and counted the river’s bends.'],
    [23, 'food', 'B', 'Bram Oakes roasted a pig that escaped his cargo and called it salvage.'],
    // Chapter 24
    [24, 'letter', 'S', 'The Canal Board wrote that the Harrowmere lock would stay open and be deepened next year.'],
    [24, 'festival', 'SBI', 'The town rang the chapel bell for the lock, and all three stood on the gate with {user}.'],
    [24, 'survey', 'S', 'The Canal Board asked {user} to stay on and oversee the deepening.'],
    [24, 'barge', 'B', 'Bram Oakes was promised the stone-carrying contract for the lock works.'],
    [24, 'shop', 'I', 'Ilse Varn closed her shop for an afternoon for the first time since her father died.'],
    [24, 'gift', 'S', 'Sera Quill gave {user} her mother’s brass plumb line.'],
    [24, 'debt', 'B', 'Bram Oakes paid back the cooper’s six crowns that he had long forgotten lending.'],
    [24, 'weather', 'I', 'A clear week dried the hay, and Ilse Varn cut her whole garden in two days.'],
    // Chapter 25
    [25, 'lock', 'S', 'Sera Quill marked out the site of the new lock chamber with {user} and a ball of twine.'],
    [25, 'barge', 'B', 'Bram Oakes began saving a crown a week toward a boat of his own again.'],
    [25, 'shop', 'I', 'Ilse Varn sent her remedy book to a printer in the city.'],
    [25, 'family', 'S', 'Sera Quill wrote to the sea locks to say she no longer wanted the post.'],
    [25, 'quarrel', 'BI', 'Bram Oakes and Ilse Varn disagreed over whether rain was coming, and both were wrong.'],
    [25, 'survey', 'B', '{user} surveyed a quarry upstream from the deck of the Dunlin.'],
    [25, 'animals', 'S', 'The weir otters had three cubs, and Sera Quill counted them every morning.'],
    [25, 'food', 'I', 'Ilse Varn’s bees gave their first honey, and she sent a jar to the lock-house.'],
    // Chapter 26
    [26, 'repair', 'S', 'The first cart of quarry stone came down the towpath and cracked a paving slab.'],
    [26, 'barge', 'B', 'Bram Oakes carried eleven loads of stone on the Dunlin in a fortnight.'],
    [26, 'shop', 'I', 'The printer sent Ilse Varn proofs of her book with the plants in the wrong order.'],
    [26, 'lock', 'S', 'Sera Quill argued with the works foreman over where to pile spoil and won.'],
    [26, 'music', 'SBI', 'A travelling piper played at the Wheatsheaf, and all three stayed past midnight with {user}.'],
    [26, 'illness', 'B', 'Bram Oakes strained his back loading stone, and Ilse Varn rubbed it with horse liniment.'],
    [26, 'road', 'S', 'The works closed the towpath, and Sera Quill ferried walkers across in the lock punt.'],
    [26, 'gift', 'I', '{user} redrew the plants for Ilse Varn’s book in the right order.'],
    // Chapter 27
    [27, 'lock', 'S', 'The navvies struck blue clay at six feet, and {user} moved the new chamber two yards east.'],
    [27, 'market', 'I', 'Ilse Varn sold liniment to the whole works gang at the market.'],
    [27, 'barge', 'B', 'Bram Oakes was offered a half share in a new barge by the stone merchant.'],
    [27, 'family', 'S', 'Sera Quill’s aunt returned for the summer and was put in charge of feeding the navvies.'],
    [27, 'survey', 'S', '{user} levelled the new sill with Sera Quill holding the staff.'],
    [27, 'rumour', 'BI', 'The works gang started a rumour that the old lock was haunted by a drowned keeper.'],
    [27, 'fishing', 'B', 'The works muddied the weir pool, and Bram Oakes moved his night lines upstream.'],
    [27, 'food', 'SBI', 'Sera Quill’s aunt fed forty navvies and the three of them from one cauldron.'],
    // Chapter 28
    [28, 'shop', 'I', 'Ilse Varn’s book came from the printer, and she put the first copy in {user}’s hands.'],
    [28, 'barge', 'B', 'Bram Oakes took the half share and laid the keel of a barge he means to call the Kestrel.'],
    [28, 'lock', 'S', 'The first course of the new chamber wall was laid, and Sera Quill set a coin under it.'],
    [28, 'quarrel', 'S', 'Sera Quill and {user} disagreed over the gate design and settled it with a model in clay.'],
    [28, 'festival', 'SBI', 'At harvest supper {user} was made to give a speech and forgot the miller’s name.'],
    [28, 'debt', 'I', 'Ilse Varn lent Bram Oakes ten crowns toward his keel and wrote it in her book.'],
    [28, 'animals', 'B', 'Bram Oakes’s dog Bosun fathered a litter at the mill, and Bram denied it.'],
    [28, 'weather', 'S', 'An autumn gale took slates off the lock-house, and {user} went up the ladder.'],
    // Chapter 29
    [29, 'lock', 'S', 'The new gates arrived by road on two wagons, and half the town turned out to look.'],
    [29, 'shop', 'I', 'A physician from the city wrote to Ilse Varn to praise her chapter on fevers.'],
    [29, 'barge', 'B', 'Bram Oakes planked the hull of the Kestrel with {user} holding the dolly.'],
    [29, 'chapel', 'SI', 'Sera Quill and Ilse Varn decorated the chapel for the smith’s son’s christening.'],
    [29, 'survey', 'S', '{user} finished the drawings of the new chamber and signed them.'],
    [29, 'gift', 'B', 'Bram Oakes gave {user} a ship’s clasp knife with a horn handle.'],
    [29, 'road', 'I', 'Ilse Varn and {user} walked the north road again to the milestone, a year after the first time.'],
    [29, 'food', 'S', 'Sera Quill’s aunt declared {user}’s dumplings fit for people.'],
    // Chapter 30
    [30, 'lock', 'S', 'The old lock passed its last boat, and Sera Quill closed the gates herself.'],
    [30, 'barge', 'B', 'Bram Oakes launched the Kestrel sideways into the river, and it floated level.'],
    [30, 'shop', 'I', 'Ilse Varn began a second book, on the plants of the Tarn fen.'],
    [30, 'festival', 'SBI', 'The town held a supper on the new lock wall, and all three sat with {user} at the head.'],
    [30, 'letter', 'S', 'The Canal Board offered {user} a post in the city, to begin in spring.'],
    [30, 'family', 'I', 'Ilse Varn asked {user} whether he meant to take the post in the city, and he did not answer.'],
    [30, 'weather', 'B', 'The first frost of the second winter whitened the deck of the Kestrel.'],
    [30, 'survey', 'S', '{user} pinned the finished map of the whole river beside the first one in the lock-house.'],
];

export const FIXTURE_MEMORIES: FixtureMemory[] = ROWS.map(([chapter, topic, knownBy, text, mark], index) => ({
    id: index + 1,
    chapter,
    topic,
    text,
    knownBy: [...knownBy].map((letter) => CAST_BY_LETTER[letter]),
    ...mark,
}));

/** What Ilse believes, and which is false: the truth is the `fire` Memory, which only Bram knows. */
export const ILSE_BELIEF = { characterName: ILSE, text: '{user} set the fire that burned her drying shed on Candle Night.' };

/** An anchor event: planted in the first five Chapters, with a detail nobody could guess. */
export interface Anchor {
    name: AnchorName;
    /** Its Memory in the fixture. */
    memory: FixtureMemory;
    /** Words that appear nowhere else in the Story or the other Memories: said, they show the Memory was read. */
    telltale: RegExp;
    /** The event's own words, telltale included: what a reply holds when it brings the event up, in any wording. */
    eventWords: RegExp;
    /** A user turn that names the event. */
    directCue: string;
    /** A user turn that relates to it without naming it or reusing its words. */
    contextCue: string;
    /** A user turn it has no bearing on. */
    unrelatedTurn: string;
    /** The Character the cue is put to. */
    with: string;
    /** The topics that bear on the cues: a Memory chosen by meaning with another topic is counted as unrelated. */
    topics: string[];
}

const memoryOf = (anchor: AnchorName): FixtureMemory => FIXTURE_MEMORIES.find((memory) => memory.anchor === anchor)!;

export const ANCHORS: Anchor[] = [
    {
        name: 'rescue',
        memory: memoryOf('rescue'),
        telltale: /Marigold|Tobin/i,
        eventWords: /Marigold|Tobin|capsiz|skiff|owe[sd]? (?:you|him|Corin) a life/i,
        directCue: 'Corin asks Sera whether she remembers the day he pulled her brother out from under the capsized skiff.',
        contextCue: 'Corin tells Sera he has never asked her for anything, and that today he has to ask a favour she will not like.',
        unrelatedTurn: 'Corin asks Sera what the upstream gauge read at dawn, for his survey notes.',
        with: SERA,
        topics: ['rescue', 'family', 'debt'],
    },
    {
        name: 'report',
        memory: memoryOf('report'),
        telltale: /Vessin|forty crowns/i,
        eventWords: /Vessin|lamp oil|fined|forty crowns|toll office/i,
        directCue: 'Corin asks Bram whether he is still sore about the casks of lamp oil and the fine at the toll office.',
        contextCue: 'Corin asks Bram, a little carefully, whether there is still bad blood between the two of them.',
        unrelatedTurn: 'Corin asks Bram how many bends the river makes between here and Stell.',
        with: BRAM,
        topics: ['toll', 'quarrel', 'debt'],
    },
    {
        name: 'fire',
        memory: memoryOf('fire'),
        telltale: /Candle Night/i,
        eventWords: /Candle Night|drying shed|shed (?:burn|fire)|set (?:the|that|a) fire|burn(?:ed|t) (?:down )?(?:my|her|the) shed/i,
        directCue: 'Corin asks Bram what really happened the night Ilse’s drying shed burned.',
        contextCue: 'Corin tells Bram that Ilse still looks at him as if he had done her some wrong, and he does not know why.',
        unrelatedTurn: 'Corin asks Bram what cargo pays best at this time of year.',
        with: BRAM,
        topics: ['fire', 'rumour', 'shop'],
    },
    {
        name: 'key',
        memory: memoryOf('key'),
        telltale: /green cord/i,
        eventWords: /green cord|silver (?:lock )?key/i,
        directCue: 'Corin asks Sera about the silver lock key she used to wear round her neck.',
        contextCue: 'Corin asks Sera how a keeper makes sure nobody but her can open the gates.',
        unrelatedTurn: 'Corin asks Sera whether the otters at the weir have been seen this week.',
        with: SERA,
        topics: ['key', 'lock'],
    },
    {
        name: 'promise',
        memory: memoryOf('promise'),
        telltale: /ghostcap/i,
        eventWords: /ghostcap|moss/i,
        directCue: 'Corin asks Ilse whether she still wants the ghostcap moss he said he would bring from the fen.',
        contextCue: 'Corin tells Ilse the nights are turning cold, and asks whether there is anything he still owes her before winter.',
        unrelatedTurn: 'Corin asks Ilse how her bees are doing in the chimney.',
        with: ILSE,
        topics: ['promise', 'fen', 'shop'],
    },
    {
        name: 'secret',
        memory: memoryOf('secret'),
        telltale: /Odalys/i,
        eventWords: /Odalys|cannot read|can(?:’|')?t read|never learn(?:ed|t) to read/i,
        directCue: 'Corin asks Bram, quietly, whether his niece still keeps his ledger for him because he cannot read it.',
        contextCue: 'Corin holds out a written contract for the stone-carrying and asks Bram to look it over before he signs.',
        unrelatedTurn: 'Corin asks Bram whether the pike are biting below the weir.',
        with: BRAM,
        topics: ['secret', 'family', 'letter'],
    },
];

export const anchor = (name: AnchorName): Anchor => ANCHORS.find((one) => one.name === name)!;

/** A thing of the story that a later Chapter overturns, with its state before and after (Layer 4). */
export interface ChangedItem {
    name: string;
    /** The Chapter the change happens in: an account of fewer Chapters rightly gives the state before. */
    changedIn: number;
    before: string;
    after: string;
    /** Words an account holds when it speaks of the item at all; with none, it left the item out. */
    mentions: RegExp;
}

export const CHANGED_ITEMS: ChangedItem[] = [
    {
        name: 'the lock key',
        changedIn: 18,
        before: 'Sera Quill wears the silver lock key on a green cord.',
        after: 'Ilse Varn holds the silver lock key; Sera Quill gave it to her to keep and no longer carries it.',
        mentions: /\bkey\b/i,
    },
    {
        name: 'Bram’s boat',
        changedIn: 21,
        before: 'Bram Oakes owns the barge Heron.',
        after: 'Bram Oakes sold the Heron and poles a hired flat, the Dunlin; he owns no barge until he builds the Kestrel in Chapter 28.',
        mentions: /Heron|Dunlin/i,
    },
];

/** The four major events an account of any length should still hold, each by its telltale (Layer 4). */
export const MUST_STAY: AnchorName[] = ['rescue', 'report', 'fire', 'promise'];

/** The minor details an account may rightly drop: counted, never a pass or a fail (Layer 4). */
export const MINOR_DETAILS: { name: string; tells: RegExp }[] = FIXTURE_MEMORIES.filter((memory) => memory.minor).map((memory) => ({
    name: memory.minor!,
    tells: new RegExp(memory.minor!.replace('’', '[’\']'), 'i'),
}));


/**
 * What a Story so far may rightly drop (Layer 4): weather, the look of the place, talk that settles
 * nothing. Set between the events of each Chapter, so the Messages have something to squeeze, as
 * played prose does. None of it names a thing an account is marked on.
 */
export const STORY_SMALL_TALK: string[] = [
    'The morning came up grey over the water, and the gulls argued on the weir.',
    'Smoke stood straight up from the chimneys along the lane, as it does before a still day.',
    'Somebody was beating a carpet in a yard behind the Wheatsheaf, slowly, as if it had done them wrong.',
    'The towpath was all puddles, each one holding its own small piece of sky.',
    `@${SERA}: Wind is round to the east. It will be dry by noon.`,
    'A cart went over the bridge with one wheel complaining, and the complaint could be heard a long way.',
    'The baker’s boy ran past with a tray on his head and did not spill a loaf.',
    `@${BRAM}: I have seen worse days and called them fine, so I will call this one fine and be done.`,
    'The light went early behind the hill, and the windows along the river showed yellow one by one.',
    'Rain came on in the afternoon, the thin kind that wets a coat without seeming to fall.',
    `@${ILSE}: It is colder than yesterday by a good deal. I can tell by the glass on the sill.`,
    'Two dogs met on the bridge, considered a quarrel, and thought better of it.',
    'The river made its ordinary noise under the gates, which nobody in Harrowmere hears any longer.',
    'A boy was fishing off the mooring posts with a bent pin and a great deal of patience.',
    `@${BRAM}: There is a smell of bread from somewhere, and I mean to find out where before it is all gone.`,
    'The church clock struck the hour a little late, as it always has.',
    'Mist lay in the low field until the sun was well up, and then it was gone between one look and the next.',
    `@${SERA}: Mind the step there. It has been loose since spring and nobody mends it.`,
    'Washing hung in every yard, and the whole lane smelled of soap and wet stone.',
    'The swifts were back over the water, cutting it close and never touching.',
    `@${ILSE}: You have mud to the knee. Did you walk through the field or under it?`,
    'A barge horse stood in its harness by the gate, asleep on three legs.',
    'The evening was long and gold, and nobody on the river was in any hurry to end it.',
    `@${BRAM}: Sit a minute. The work has waited this long, and it will not run off while we watch it.`,
    'Leaves had begun to come down along the towpath, a few at a time, as if trying it out.',
    'Somewhere a door banged twice in the wind, and then somebody thought to latch it.',
    `@${SERA}: That will do for today. The light is going, and I do not work a gate I cannot see.`,
    'The stars came out thick over the hill, and the frost could be felt coming in the stillness.',
    'A woman was singing at her window further up the lane, not well, and not minding.',
    `@${ILSE}: I have forgotten what I came in here for. Give me a moment and it will come back.`,
    'The market square was being swept, and the dust hung in the low sun like something worth having.',
    'Children were sliding on the frozen ditch behind the cooper’s yard until they were called in.',
    `@${BRAM}: Well, that is the day gone, and I could not tell you where I put half of it.`,
    'The first swallows sat in a row on the mooring line, facing the same way like a congregation.',
    'It was the kind of afternoon in which nothing happens, and everybody is glad of it.',
    `@${SERA}: Kettle is on, if you want it. I am not asking twice.`,
];

/** The story lengths the Story so far is written at: through this Chapter (Layer 4). */
export const STORY_LENGTHS = [6, 12, 18, 24, 30];

/**
 * The Messages of the story through `chapter`, as the Story so far writer is given them: each
 * Chapter is a line of the user's and the Narrator's telling of its events, in order. Flatter than
 * played prose, and it says so in the spec.
 */
export function storyMessages(chapter: number): { speaker: string; text: string }[] {
    const messages: { speaker: string; text: string }[] = [];
    for (let at = 1; at <= chapter; at++) {
        const events = FIXTURE_MEMORIES.filter((memory) => memory.chapter === at).map((memory) => memory.text.replaceAll('{user}', CORIN));
        messages.push({ speaker: CORIN, text: `${CORIN} goes about the days of chapter ${at} in Harrowmere.` });
        // Each event is followed by a line the account may drop; a spoken one stands as a paragraph of its own, as in a reply.
        const told = events.flatMap((event, index) => [event, STORY_SMALL_TALK[(at * 7 + index * 5) % STORY_SMALL_TALK.length]]);
        const paragraphs: string[] = [];
        for (const line of told) {
            if (line.startsWith('@') || paragraphs.length === 0 || paragraphs.at(-1)!.startsWith('@')) paragraphs.push(line);
            else paragraphs[paragraphs.length - 1] += ` ${line}`;
        }
        messages.push({ speaker: 'Story', text: paragraphs.join('\n\n') });
    }
    return messages;
}
