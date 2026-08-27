import projectUtils from '../../utilities/utils.js'
import { LLMWrapper } from '../../utilities/LLMWrapper.js'
import { marked } from 'marked';
import logger from '../../utilities/logger.js';

class ResponseFormatError extends Error {
    constructor(message) {
        super(message);
        this.name = "ResponseFormatError";
    }
}

class SDCodeError extends Error {
    constructor(message, lineNum) {
        super(`Error on line ${lineNum} - ${message}`);
        this.name = "SDCodeError";
    }
}

class QuantitativeSDCodeEngineBrain {
    static SDCODE_INTRO=
`
To construct SFD models, you will output a program written in a language called SDCode. 
SDCode uses a syntax similar to that of the programming language Python.
Please output your SDCode program in a markdown code block using triple backticks at the start and end;
you will receive an error message if you do not do so as the program cannot be parsed otherwise.

Below is a sample program that highlights all of the syntax rules of SDCode.
`
    static SDCODE_SYNTAX_BASIC=
`
### WRITING COMMENTS: Comments work the exact same they do in Python.
# When using comments to explain the reasoning for a created variable/relationship,
# append the comment directly to the end of the code line, to ensure it is recognized correctly.
# Comments never directly affect how a simulation runs.

### STRINGS
# Strings should always be delimited by double quotation marks "like this".
# You CANNOT use double quotation marks inside strings, even with backslashing;
# if you need to for whatever reason, use a single quotation mark instead " 'like this' ".

### SIMULATION SETUP
# The setup command listed below sets up the parameters that define how the model simulation should run.
# All SDCode programs must include this command exactly once.
# setup takes five required arguments. In order, they are:
# timeUnits - A string indicating the unit of time for this model. This should match with the equations that you generate.
# startTime - A number indicating the time at which this model starts calculating. It is measured in the units of "timeUnits".
# stopTime - A number indicating the time at which this model stops calculating. It is measured in the units of "timeUnits". 
# timeStep - A number indicating the time step for the model, how often is it calculated. The most common dt is 0.25. It is measured in the units of "timeUnits".
# integrationMethod - Either the string "Euler" or "RK4", indicating the method used to solve this model. "Euler" is the default, Use "RK4" for systems with oscillations.
setup("year", 0, 10.0, 0.25, "Euler")

### NAMING COMPONENTS
# Model components are identified by a unique name.
# This name is allowed to comprise only of alphabetical characters, spaces, and the "_" character.
# Unlike python, when defining and referencing these components, the name must be wrapped in [square brackets].

### COMPONENT TYPES
# There are three main component types - stocks, flows, and variables. 
# A stock is an accumulation of its flows, it is an integral. A stock can only change because of its flows. 
# A flow is the derivative of a stock. 
# A plain variable is used for algebraic expressions.

### CREATING VARIABLES
# The single argument taken is a string describing the unit.
[varA] = Variable("units") # reasoning for creating [varA]
[variable b] = Variable("units") # reasoning for creating [variable b]
[variable_c] = Variable("units") # reasoning for creating [variable_c]

### DEFINING EQUATIONS
# Set the XMILE equation for a component with the .setEquation method. This takes one argument, the XMILE equation as a string.
# Every component must have exactly one XMILE equation defined for it somewhere in the simulation 
# (although it does not need to be immediately after declaration).
# This equation can be a number, or an algebraic expression of other variables.
# Refer to other variables with their name, without brackets; 
# if the name of a variable contains spaces, replace them with underscores in the equation.
# NEVER use IF THEN ELSE or conditional functions inside of equations. 
# If you want to check for division by zero use the operator //
# STOCKS ONLY: The .setEquation method sets the **initial value** of the stock. The equations for flows are automatically applied;
# you do not need to manually make any INTEG calls.
[varA].setEquation("10") # [varA] is set to the numeric value of 10
[variable b].setEquation("5*varA") # [variable b] is set to be 5 times [varA]
[variable_c].setEquation("varA + variable_b") # [variable_c] is set to be the sum of [varA] and [variable b]. Note the underscore replacement in the equation

### CREATING STOCKS
# The single argument taken is a string describing the unit.
[stockA] = Stock("units")
[stockA].setEquation("100") # [stockA] has an initial value of 100
[stockB] = Stock("units")
[stockB].setEquation("0") # [stockB] has an initial value of 0

### CREATING FLOWS
# The single argument taken is a string describing the unit.
[flowA] = Flow("units")
[flowB] = Flow("units")
[flowA].setEquation("variable_b")
[flowB].setEquation("variable_c*stockA")

### UNIFLOW FLOWS
# By default, all flows are bi-directional.
# Use the .setUniflow method on flows to prevent them from going negative.
# A uniflow flow represents a one-directional process that can only add to or subtract from a stock in one direction.
# If set to uniflow, the flow will be constrained to be non-negative during simulation - if the equation would produce a negative value, 
# it will be set to zero instead.
# Common examples of uniflow flows: births, deaths, purchases, production. 
# Common examples of non-uniflow flows: net migration, balance adjustments, corrections.
[flowA].setUniflow()

### SETTING FLOWS
# Use the .addInflow and .addOutflow methods on a stock to attach flows.
# CRITICAL: A flow can never be both an inflow and outflow of the same stock.
# (However, it is ok for a flow to be the inflow of one stock and the outflow of a different stock.)
[stockA].addInflow([flowA])
[stockA].addOutflow([flowB])
[stockB].addInflow([flowB])

### SPECIFYING RELATIONSHIPS
# You should specify "cause-effect" relationships between every pair of components in the model.
# To do so, use the .connect method, which is available on all components.
# Call the .connect method on the "causal" component.
# The .connect method takes two arguments; the first argument is the "effect" component and is REQUIRED, 
# and the second is an number that indicates the polarity of the relationship.
# Set this to 1 if the relationship has positive polarity, and 0 if the relationship has negative polarity.
# If it does not make sense to define a polarity for a relationship, set this to -1 instead.
# You can call the .connect method at any point in the model's program, provided both components have been previously defined.
[varA].connect([variable b], -1) # the reasoning for this relationship
[varA].connect([variable_c], -1)
[variable b].connect([variable_c], -1)
[variable b].connect([flowA], -1)
[variable_c].connect([flowB], -1)
[stockA].connect([flowB], -1)
[flowA].connect([stockA], 1)
[flowB].connect([stockA], 0)
[flowB].connect([stockB], 1)
`

    static SDCODE_SYNTAX_MODULES=
`
`

    static SDCODE_SYNTAX_ARRAYS=
`
`

    static SDCODE_EXAMPLES_INTRO=
`
Here are some example models to demonstrate the usage of SDCode.
`

    static SDCODE_EXAMPLES_BASIC=
`
Basic Water Tank Simulation:
\`\`\`
# This model simulates a water tank that receives a constant supply of rain and drains at a rate proportional to its capacity.
setup("minute", 0, 60.0, 0.25, "Euler")

[water_tank_capacity] = Stock("liters")
[water_tank_capacity].setEquation("0")

[rain_rate] = Variable("liters/minute")
[rain_rate].setEquation("5")
[incoming_rain] = Flow("liters")
[incoming_rain].setEquation("rain_rate")
[incoming_rain].setUniflow()
[rain_rate].connect([incoming_rain], 1)
[water_tank_capacity].addInflow([incoming_rain])
[incoming_rain].connect([water_tank_capacity], 1) # more incoming rain causes an increase in the water tank capacity

[drain_rate] = Variable("1/minute")
[drain_rate].setEquation("0.1")
[draining_water] = Flow("liters")
[draining_water].setEquation("drain_rate")
[draining_water].setUniflow()
[drain_rate].connect([draining_water], 1)
[water_tank_capacity].addOutflow([draining_water])
[draining_water].connect([water_tank_capacity], 0) # more draining water causes a decrease in the water tank capacity
\`\`\`
`

    static SDCODE_EXAMPLES_MODULES=
`
`

    static SDCODE_EXAMPLES_ARRAYS=
`
`

    static SDCODE_MODELING_TIPS =
`
Below are some additional tips to remember when creating models using SDCode.

SDCode allows for flexible line ordering; take advantage to create readable models! For example, the below generally lead to cleaner code:
- Avoid clumping all variable declarations at the top of the complex models
- Group logically related components in nearby lines
- Connect components and define equations near the relevant declarations, rather than all at the end of the model

These are good conventions to follow when naming components:
- Use names that are descriptive of the scenario; ideally, someone looking at the model with no context should be able to guess what the model is simulating.
    - For example, names like "apple_inventory" or "rabbit_population" are better than "inventory" and "population".
    - Do this even if the unit of the component already describes it; redundancy is OK!
        - [inventory] = Stock("apples") # bad
        - [apples] = Stock("apples") # good
        - [apple_inventory] = Stock("apples") # good
- Concise is better; avoid compound names longer than five words
- Try not to create excessive variables, especially if unnecessary
- Use neutral terminology; do not assign positive/negative connotations to components if possible

When identifying causal relationships in a provided scenario, assign a positive or negative polarity where appropriate.
- Positive polarity: Variables move together (both increase OR both decrease)
  Example 1: Decrease in cause -> decrease in effect = POSITIVE
  Example 2: Increase in cause -> increase in effect = POSITIVE
- Negative polarity: Variables move opposite (anticorrelated)
  Example 1: Decrease in cause -> increase in effect = NEGATIVE
  Example 2: Increase in cause -> decrease in effect = NEGATIVE

When building upon user-provided models: make sure to understand the difference between adding components and modifying existing ones!
Take care when modifying existing code lines and document all changes made to them.

Double-check validity as you go: make sure the model you are creating truly represents the described scenario!
`

    static FORMULATION_ERROR_SECTION =
`
Finally, when reviewing or fixing models, detect and correct these common errors:

a. VARIABLE TYPE ERRORS FOR AGGREGATIONS:
   - Simple sums (e.g., total population) MUST be auxiliaries (type "variable"), NOT stocks
   - Stocks represent accumulations via flows; sums are algebraic calculations

b. AVERAGING FUNCTION ERRORS:
   - USE SMOOTH function for moving averages
   - DO NOT USE DELAY1 or DELAY3 for averaging (delays only shift time, they don't average)

- PROVIDE detailed explanation listing: every error found, exact variable name, what was wrong, how it was fixed
`

    static MENTOR_ADDITIONAL_CONCERNS =
`
Additionally, as a mentor, critically assess model completeness and guide users through questioning:
- Are all relevant variables included?
- Are there missing connections between variables that should exist?
- Work with the user to help them understand where the model might fall short
- Ensure all suggestions follow MECE principle (Mutually Exclusive, Collectively Exhaustive)
- NEVER suggest additions that duplicate existing model elements

For each stock, help the user consider if there are any missing flows which could drive important dynamics relative to their problem statement.
`

    static MENTOR_MODE_INTRO =
`You are a System Dynamics Mentor and Teacher. Generate stock and flow models from user-provided text while teaching users to understand and improve their work through Socratic questioning and constructive critique.

PEDAGOGICAL APPROACH:
Your role is to facilitate learning, NOT to provide praise. Execute these teaching principles:
- Ask probing questions that guide users to discover what could be improved in the model
- Think critically about the model and their questions to determine the right questions to ask
- Be a constant source of constructive critique
- Explain problems you identify AND ask questions to help users learn to critique models themselves
- Explicitly state when you lack confidence in your model
- Help users learn System Dynamics principles through dialogue
- Add smaller, logically connected pieces of structure incrementally to the model

CRITICAL TEACHING RESTRICTION:
NEVER identify feedback loops for the user in explanatory text. Let users discover loops themselves through your questioning.`

    static PROFESSIONAL_MODE_INTRO =
`You are a professional Systems Dynamics modeler.
Please generate stock-and-flow models (SFDs) from user-provided queries to the best of your ability.`

    static generateSystemPrompt(mentorMode, supportsArrays, supportsModules, supportsSubTypes) {
        let prompt = "";

        // Add intro based on mode
        if (mentorMode) prompt += QuantitativeSDCodeEngineBrain.MENTOR_MODE_INTRO + "\n\n";
        else            prompt += QuantitativeSDCodeEngineBrain.PROFESSIONAL_MODE_INTRO + "\n\n";

        prompt += QuantitativeSDCodeEngineBrain.SDCODE_INTRO;
        prompt += "\n```\n";

        prompt += QuantitativeSDCodeEngineBrain.SDCODE_SYNTAX_BASIC + "\n\n";
        if (supportsArrays) prompt += QuantitativeSDCodeEngineBrain.SDCODE_SYNTAX_ARRAYS;
        if (supportsModules) prompt += QuantitativeSDCodeEngineBrain.SDCODE_SYNTAX_MODULES;

        prompt += "\n```\n\n" + QuantitativeSDCodeEngineBrain.SDCODE_EXAMPLES_INTRO + "\n\n";

        prompt += QuantitativeSDCodeEngineBrain.SDCODE_EXAMPLES_BASIC;
        if (supportsArrays) prompt += "\n\n" + QuantitativeSDCodeEngineBrain.SDCODE_EXAMPLES_ARRAYS;
        if (supportsModules) prompt += "\n\n" + QuantitativeSDCodeEngineBrain.SDCODE_EXAMPLES_MODULES;

        prompt += QuantitativeSDCodeEngineBrain.SDCODE_MODELING_TIPS + "\n\n";

        if (mentorMode) prompt += QuantitativeSDCodeEngineBrain.MENTOR_ADDITIONAL_CONCERNS + "\n\n";
        prompt += QuantitativeSDCodeEngineBrain.FORMULATION_ERROR_SECTION;
        
        return prompt;
    }

    static MENTOR_SYSTEM_PROMPT = QuantitativeSDCodeEngineBrain.generateSystemPrompt(true, true, true)

    static DEFAULT_SYSTEM_PROMPT = QuantitativeSDCodeEngineBrain.generateSystemPrompt(false, true, true)

    static DEFAULT_ASSISTANT_PROMPT = 
`I want your response to consider the model which you have already so helpfully given to us. You should never change the name of any variable you've already given us. Your response should add new variables wherever you have evidence to support the existence of the relationships needed to close feedback loops.  Sometimes closing a feedback loop will require you to add multiple relationships.`

    static DEFAULT_BACKGROUND_PROMPT =
`Please be sure to consider the following critically important background information when you give your answer.

{backgroundKnowledge}`

    static DEFAULT_PROBLEM_STATEMENT_PROMPT = 
`The user has stated that they are conducting this modeling exercise to understand the following problem better.

{problemStatement}`

    #data = {
        backgroundKnowledge: null,
        problemStatement: null,
        openAIKey: null,
        googleKey: null,
        mentorMode: false,
        underlyingModel: LLMWrapper.BUILD_DEFAULT_MODEL,
        systemPrompt: null, // Will be generated in constructor based on mentorMode and supportsArrays
        assistantPrompt: QuantitativeSDCodeEngineBrain.DEFAULT_ASSISTANT_PROMPT,
        backgroundPrompt: QuantitativeSDCodeEngineBrain.DEFAULT_BACKGROUND_PROMPT,
        problemStatementPrompt: QuantitativeSDCodeEngineBrain.DEFAULT_PROBLEM_STATEMENT_PROMPT,
        supportsArrays: false,
        supportsModules: false,
        supportsSubTypes: false
    };

    #llmWrapper;

    constructor(params) {
        Object.assign(this.#data, params);

        // Generate system prompt based on mentor mode, array support, module support, and sub-type support if not explicitly provided
        if (!this.#data.systemPrompt) {
            this.#data.systemPrompt = QuantitativeSDCodeEngineBrain.generateSystemPrompt(
                this.#data.mentorMode,
                this.#data.supportsArrays,
                this.#data.supportsModules,
                this.#data.supportsSubTypes
            );
        }

        if (!this.#data.problemStatementPrompt.includes('{problemStatement')) {
            this.#data.problemStatementPrompt = this.#data.problemStatementPrompt.trim() + "\n\n{problemStatement}";
        }

        if (!this.#data.backgroundPrompt.includes('{backgroundKnowledge')) {
            this.#data.backgroundPrompt = this.#data.backgroundPrompt.trim() + "\n\n{backgroundKnowledge}";
        }

        this.#llmWrapper = new LLMWrapper(this.#data);
    }

    #fixVariablesAndConvertEquations(response, usedFlowNames, variableNameMap, namesToConvert) {
        // Compile the XMILE replacement regex ONCE (skip entirely if nothing to convert).
        let combinedRegex = null;
        let replaceFn = null;
        if (namesToConvert.length > 0) {
            // Longest-first so the alternation prefers longer matches at each position.
            namesToConvert.sort((a, b) => b.length - a.length);
            const escaped = namesToConvert.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            combinedRegex = new RegExp(
                '(?<=[\\s\\(\\[,+\\-*/^=<>]|^)(' + escaped.join('|') + ')(?=[\\s\\)\\],+\\-*/^=<>]|$)',
                'g'
            );
            replaceFn = (match) => variableNameMap.get(match) || match;
        }

        // Single pass per variable handles: orphan-flow demotion, DT→TIME, forElements
        // normalization, and XMILE replacement across equation, arrayEquations, and
        // additionalProperties.
        for (const v of response.variables) {
            if (v.type === 'flow' && !usedFlowNames.has(projectUtils.caseFold(v.name))) {
                v.type = 'variable';
            } else if (v?.graphicalFunction?.points?.length > 0 && v.equation) {
                if (v.equation.trim().toLowerCase() === 'dt') {
                    v.equation = 'TIME';
                }
            }

            if (Array.isArray(v.arrayEquations)) {
                for (const eq of v.arrayEquations) {
                    if (!Array.isArray(eq.forElements)) {
                        eq.forElements = typeof eq.forElements === 'string'
                            ? eq.forElements.split(',').map(s => s.trim())
                            : [];
                    }
                }
            }

            if (!combinedRegex) continue;

            if (typeof v.equation === 'string' && v.equation) {
                const original = v.equation;
                v.equation = original.replace(combinedRegex, replaceFn);
                if (original !== v.equation) {
                    logger.debug(`[XMILE Conversion] Variable "${v.name}": "${original}" → "${v.equation}"`);
                }
            }

            if (Array.isArray(v.arrayEquations)) {
                for (const eq of v.arrayEquations) {
                    if (typeof eq.equation === 'string' && eq.equation) {
                        const original = eq.equation;
                        eq.equation = original.replace(combinedRegex, replaceFn);
                        if (original !== eq.equation) {
                            logger.debug(`[XMILE Conversion] Variable "${v.name}"[${eq.forElements.join(',')}]: "${original}" → "${eq.equation}"`);
                        }
                    }
                }
            }

            if (v.subType && v.additionalProperties && typeof v.additionalProperties === 'object') {
                for (const key of Object.keys(v.additionalProperties)) {
                    const val = v.additionalProperties[key];
                    if (typeof val !== 'string') continue;
                    const replaced = val.replace(combinedRegex, replaceFn);
                    if (replaced !== val) {
                        v.additionalProperties[key] = replaced;
                        logger.debug(`[XMILE Conversion] Variable "${v.name}" additionalProperties.${key}: "${val}" → "${replaced}"`);
                    }
                }
            }
        }
    }

    #extractMethodArguments(methodCall, lineNum) {
        // given a method call as a string such as "setEquation("...") # reasoning",
        // extract the method name, arguments, and attached comment (if any).
        const trimmed = methodCall.trim();
        let idx = 0;
        
        const res = {
            method: "",
            args: [],
            comment: ""
        }
        
        // extract method name
        while (idx < trimmed.length && trimmed[idx] !== "(") {
            res.method += trimmed[idx];
            idx++;
        }
        if (idx >= trimmed.length) throw new SDCodeError("syntax error (missing parentheses?)", lineNum);

        // extract method args
        idx++;
        let leftIdx = idx;
        let inString = false;
        while (idx < trimmed.length && (inString || trimmed[idx] !== ")")) {
            if (trimmed[idx] === "\"") inString = !inString;
            idx++;
        }
        if (idx >= trimmed.length) throw new SDCodeError("syntax error (missing parentheses?)", lineNum);
        const argsRaw = trimmed.slice(leftIdx, idx).split(",").map(s => s.trim());
        inString = false;
        for (const arg of argsRaw) {
            if (inString) {
                res.args[res.args.length - 1] += arg;
                if (arg[arg.length - 1] === "\"") {
                    inString = false;
                    // remove closing quotation mark
                    res.args[res.args.length - 1] = res.args[res.args.length - 1].slice(0, res.args[res.args.length - 1]);
                } else {
                    res.args[res.args.length - 1] += ",";
                }
            }
            else if (arg.length === 0 || arg === "") continue; // blank argument
            else if (arg[0] === "[") res.args.push(arg);
            else if (arg[0] === "\"") {
                if (arg.length > 1 && arg[arg.length-1] === "\"") res.args.push(arg.slice(1, arg.length - 1));
                else {
                    inString = true;
                    res.args.push(arg + ",");
                }
            } else {
                const parsedArg = parseFloat(arg);
                if (isNaN(parsedArg)) {
                    throw new SDCodeError(`syntax error (argument ${arg} is neither a number, component name, or string)`, lineNum);
                }
                res.args.push(parsedArg);
            }
        }

        // extract comment
        const remainder = trimmed.slice(idx);
        if (remainder !== "") {
            const hashtagIdx = remainder.indexOf("#");
            if (hashtagIdx !== -1) {
                res.comment = remainder.slice(hashtagIdx+1).trim();
            }
        }

        return res;
    }

    #verifyArgumentTypes(args, types, lineNum) {
        if (args.length !== types.length) {
            throw new SDCodeError(`expected ${types.length} arguments but got ${args.length}`, lineNum);
        }
        for (const idx in args) {
            const a = args[idx];
            const b = types[idx];
            if (Array.isArray(b)) {
                if (!b.includes(a)) throw new SDCodeError(`argument ${idx+1} must be one of [${b.join(",")}], but got ${a}`, lineNum);
            } else {
                if (typeof(a) != typeof(b)) throw new SDCodeError(`argument ${idx+1} should be ${typeof(b)}, but got ${a}`, lineNum);
            }
        }
    }

    #cleanComponentName(name, lineNum) {
        if (name.length <= 2) throw new SDCodeError(`invalid component name ${name} (missing brackets + too short?)`, lineNum);
        if (name[0] !== "[" || name[name.length-1] !== "]") {
            throw new SDCodeError(`invalid component name ${name} (should be contained in [square brackets])`, lineNum);
        }
        const splicedName = name.slice(1, name.length-1);
        if (!/^[a-zA-Z0-9_ ]+$/.test(splicedName)) {
            throw new SDCodeError(`invalid component name ${name} (only alphanumeric chars, _, and spaces allowed`, lineNum);
        }
        return splicedName;
    }

    async processResponse(originalResponse) {
        const program = originalResponse.program.split(/\r?\n|\r|\\r?\\n|\\r/).map(s => s.trim());
        const explanation = await marked.parse(originalResponse.explanation);

        console.log("===  OUTPUT MODEL ===");
        console.log(program);

        const simSpecs = {
            startTime: null,
            stopTime: null,
            dt: null,
            timeUnits: null,
            integrationMethod: null,
            arrayDimensions: [] // TODO
        }
        const mdl = {
            variables: [],
            relationships: [],
            explanation: explanation,
            title: originalResponse.title,
            specs: simSpecs,
            modules: [] // TODO
        }

        let lineNum = 0;
        // TODO: This loop does NOT currently ensure the validity of the generated model.
        for (const line of program) {
            lineNum++;
            if (line.startsWith("```")) continue; // markdown backticks, ignore
            if (line === "") continue; // blank line/newline, ignore
            if (line[0] === "#") continue; // full comment line, ignore

            // shorthand for lineParsed
            const lp = this.#extractMethodArguments(line, lineNum);
            // debug
            // console.log(lp);

            if (lp.method === "setup") {
                if (simSpecs.startTime !== null) {
                    // somehow simSpecs has already been setup?
                    // either something has gone wrong or the LLM has put two setup commands for whatever reason
                    throw new SDCodeError("duplicate setup command is not allowed", lineNum);
                }
                this.#verifyArgumentTypes(lp.args, ["", 0, 0, 0, ["Euler", "RK4"]], lineNum);
                simSpecs.timeUnits = lp.args[0];
                simSpecs.startTime = lp.args[1];
                simSpecs.stopTime = lp.args[2];
                simSpecs.dt = lp.args[3];
                simSpecs.integrationMethod = lp.args[4];
            } else if (lp.method.indexOf("=") !== -1) {
                const eqIndex = lp.method.indexOf("=")
                const compName = this.#cleanComponentName(lp.method.slice(0, eqIndex).trim(), lineNum);
                const compType = lp.method.slice(eqIndex+1).trim();
                this.#verifyArgumentTypes(lp.args, [""], lineNum);
                if (compType !== "Stock" && compType !== "Flow" && compType !== "Variable") {
                    throw new SDCodeError(`unrecognized component type ${compType}`, lineNum);
                }
                // TODO: VERIFY NAME IS NOT ALREADY TAKEN
                mdl.variables.push({
                    name: compName,
                    equation: null, // TODO: ENFORCE THAT THIS IS SET LATER
                    type: compType.toLowerCase(),
                    documentation: lp.comment,
                    units: lp.args[0],
                    ...(compType.toLowerCase() === "stock" && 
                        { inflows: [], outflows: [] }
                    ),
                    ...(compType.toLowerCase() === "flow" &&
                        { uniflow: false } // default false, set to true later if .setUniflow() is called
                    )
                });
            } else if (lp.method.indexOf(".") !== -1) {
                const pdIndex = lp.method.indexOf(".");
                const compName = this.#cleanComponentName(lp.method.slice(0, pdIndex).trim(), lineNum);
                const compMethod = lp.method.slice(pdIndex+1).trim();
                
                // This is O(N) lookup, optimize later if necessary
                let compObj = null;
                for (const comp of mdl.variables) {
                    if (comp.name === compName) {
                        compObj = comp;
                        break;
                    }
                }
                if (compObj === null) throw new SDCodeError(`component ${compName} is not defined`, lineNum);
                // ---

                if (compMethod === "setEquation") {
                    this.#verifyArgumentTypes(lp.args, [""], lineNum);
                    compObj.equation = lp.args[0];
                } else if (compMethod === "setUniflow") {
                    if (compObj.type !== "flow") throw new SDCodeError(`component ${compName} is not flow`);
                    compObj.uniflow = true;
                } else if (compMethod === "addInflow" || compMethod === "addOutflow") {
                    if (compObj.type !== "stock") throw new SDCodeError(`component ${compName} is not stock`);
                    this.#verifyArgumentTypes(lp.args, [""], lineNum);
                    const secondComp = this.#cleanComponentName(lp.args[0], lineNum);
                    // TODO: WE DON'T CHECK IF THIS COMPONENT ACTUALLY EXISTS, IF ITS BOTH INFLOW AND OUTFLOW, ETC.
                    if (compMethod === "addInflow") compObj.inflows.push(secondComp);
                    else compObj.outflows.push(secondComp);
                } else if (compMethod === "connect") {
                    this.#verifyArgumentTypes(lp.args, ["", [-1, 0, 1]], lineNum);
                    mdl.relationships.push({
                        from: compName,
                        to: this.#cleanComponentName(lp.args[0], lineNum),
                        ...(lp.args[1] !== -1 && { polarity: lp.args[1] === 1 ? "+" : "-" }),
                        reasoning: lp.comment
                    })
                }
            } else {
                throw new SDCodeError(`couldn't recognize this method call ${lp.method}`, lineNum);
            }
        }

        return mdl;
    }

    mentor() {
        this.#data.mentorMode = true;
        this.#data.systemPrompt = QuantitativeSDCodeEngineBrain.generateSystemPrompt(
            this.#data.mentorMode,
            this.#data.supportsArrays,
            this.#data.supportsModules,
            this.#data.supportsSubTypes
        );
    }

    #convertToSDCode(model) {
        const declarations = [];
        const methodCalls = [];
        // TODO: ARRANGE IN LOGICAL MANNER
        for (const varObj of model.variables) {
            declarations.push(`[${varObj.name}] = ${varObj.type[0].toUpperCase() + varObj.type.slice(1)}("${varObj.units ?? "units"}")`);
            methodCalls.push(`[${varObj.name}].setEquation("${varObj.equation}")`);
            if (varObj.type === "flow" && varObj.uniflow) {
                methodCalls.push(`[${varObj.name}].setUniflow()`);
            }
            if (varObj.type === "stock") {
                if (varObj.inflows !== undefined) {
                    for (const inflow of varObj.inflows) {
                        methodCalls.push(`[${varObj.name}].addInflow([${inflow}])`);
                    }
                }
                if (varObj.outflows !== undefined) {
                    for (const outflow of varObj.outflows) {
                        methodCalls.push(`[${varObj.name}].addOutflow([${outflow}])`);
                    }
                }
            }
        }
        // long one-liner; apologies
        const program = [`setup("${model.specs.timeUnits ?? "day"}", ${model.specs.startTime ?? 0}, ${model.specs.stopTime ?? 10.0}, ${model.specs.dt ?? 0.25}, "${model.specs.integrationMethod ?? "Euler"}")`]
            .concat(declarations.concat(methodCalls));
        for (const relObj of model.relationships) {
            program.push(`[${relObj.from}].connect([${relObj.to}], ${(relObj.polarity === undefined ? -1 : (relObj.polarity === "+" ? 1 : 0))})`);
        }
        console.log("=== USER-PROVIDED MODEL (CONVERTED TO SDCODE) ===");
        console.log(program);
        return "```\n" + program.join("\n") + "```"; 
    }
    
    setupLLMParameters(userPrompt, lastModel) {
        // build system prompt
        const { underlyingModel, systemRole, temperature, reasoningEffort } = this.#llmWrapper.getLLMParameters();
        let systemPrompt = this.#data.systemPrompt;
        let responseFormat = this.#llmWrapper.generateQuantitativeSDCodeResponseSchema(this.#data.mentorMode);

        if (!this.#llmWrapper.model.hasStructuredOutput) {
            throw new Error("Unsupported LLM " + this.#data.underlyingModel + " it does support structured outputs which are required.");
        }

        let messages = [{
            role: systemRole,
            content: systemPrompt
        }];

        if (this.#data.backgroundKnowledge) {
            messages.push({
                role: "user",
                content:  this.#data.backgroundPrompt.replaceAll("{backgroundKnowledge}", this.#data.backgroundKnowledge),
            });
        }
        if (this.#data.problemStatement) {
            messages.push({
                role: systemRole,
                content: this.#data.problemStatementPrompt.replaceAll("{problemStatement}", this.#data.problemStatement),
            });
        }

        // Check if lastModel has actual content (variables or relationships)
        if (lastModel && (lastModel.variables?.length > 0 || lastModel.relationships?.length > 0)) {
            // TODO: convert this to SDCode
            messages.push({ 
                role: "assistant", 
                content: JSON.stringify({ 
                    program: this.#convertToSDCode(lastModel),
                    explanation: ""
                }, null, 2)
            });

            if (this.#data.assistantPrompt) messages.push({ role: "user", content: this.#data.assistantPrompt });
        }

        // Give it the user prompt
        messages.push({ role: "user", content: userPrompt });

        return {
            messages,
            model: underlyingModel,
            responseFormat: responseFormat,
            temperature: temperature,
            reasoningEffort: reasoningEffort
        };
    }

    async generateModel(userPrompt, lastModel) {
        // Ensure lastModel is always defined as an empty model structure if undefined or null
        if (!lastModel || typeof lastModel !== 'object') {
            lastModel = { variables: [], relationships: [] };
        } else {
            // Ensure required arrays exist
            lastModel.variables = lastModel.variables || [];
            lastModel.relationships = lastModel.relationships || [];
        }

        console.log("=== USER PROMPT ===");
        console.log(userPrompt);

        const llmParams = this.setupLLMParameters(userPrompt, lastModel);
        const originalResponse = await this.#llmWrapper.createChatCompletion(
            llmParams.messages,
            llmParams.model,
            llmParams.responseFormat,
            llmParams.temperature,
            llmParams.reasoningEffort
        );

        // debug
        // console.log(originalResponse);

        if (originalResponse.refusal) {
            throw new ResponseFormatError(originalResponse.refusal);
        } else if (originalResponse.parsed) {
            return this.processResponse(originalResponse.parsed);
        } else if (originalResponse.content) {
            let parsedObj = { program: "", explanation: "" };
            try {
                parsedObj = JSON.parse(originalResponse.content);
            } catch (err) {
                logger.log('Bad JSON from LLM:', originalResponse);
                throw new ResponseFormatError("Bad JSON returned by underlying LLM");
            }
            return this.processResponse(parsedObj);
        } else {
            throw new ResponseFormatError("LLM response did not contain any recognized format (no refusal, parsed, or content fields)");
        }
    }
}

export default QuantitativeSDCodeEngineBrain;