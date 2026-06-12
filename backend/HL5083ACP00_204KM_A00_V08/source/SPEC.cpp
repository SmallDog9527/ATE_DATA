#include "stdafx.h"
#include "SPEC.h"

/////////////////goto CMapMemFile///////////////////////
// read csv file, and put the cell data to map[row][column]
BOOL CMapMemFile::CsvReader(map<DWORD, map<DWORD, string>> &res_map){
	int flag = 0; // record the number of '"', if it is 2, it will changed to 0 automatically
	unsigned char* ptr_begin_of_word = p;

	DWORD row = 1;
	DWORD column = 0;

	//for(DWORD i = 0; i < 1024; ++i){	// for debug
	for(DWORD i = 0; i < GetSize(); ++i){
		if(p[i] == '"'){
			++flag;
			if(flag == 1)
				ptr_begin_of_word = p + i + 1;
		}

		if(((flag == 0) || (flag == 2)) && ((p[i] == ',') || (p[i] == '\n'))) {

			++column;

			if(i == 0){
				res_map[row][column] = "";	
			}
			else{
				// it seems before '\n', there is a special char, which like "Home" key, 
				// make the cursor jump to the first char of the row. 
				// so the end of the word turn to be p + i - 1
				if((flag == 2)||(p[i] == '\n')){				
					string word(ptr_begin_of_word, p + i - 1);	// copy word from p to as string
					res_map[row][column] = word;	
				}
				else{
					string word(ptr_begin_of_word, p + i);	// copy word from p to as string
					res_map[row][column] = word;	
				}

			}

			ptr_begin_of_word = p + i + 1;

			if(p[i] == '\n'){
				++row;
				column = 0;
			}

			if(flag == 2)
				flag = 0;

		}
	}	// end of for

	ptr_begin_of_word = NULL;
	CloseMapFile();


	return TRUE;

}

/////////////////goto SPEC///////////////////////
string SPEC::int2str(DWORD n){
    char t[64];
    int i = 0;

	if(n == 0)
		return "0";
 
    while (n) {
		t[i++] = char((n % 10) + '0');
        n /= 10;
    }
    t[i] = 0;

	string result(t);
	result = result.assign(result.rbegin(), result.rend());
 
    return result;
}


string SPEC::get_step_str(LPCTSTR funclabel, unsigned int step){
	if(trim_map.find(funclabel) != trim_map.end()){
		if(trim_map[funclabel].step_vec.size() > 0){
			int pos = trim_map[funclabel].step_vec[0].find_last_of("_");
			if(pos > 1){
				string param_str(trim_map[funclabel].step_vec[0], 0, pos);
				if(trim_map[funclabel].step_vec[0].find("Step") != string::npos){
					param_str = param_str + "_Step" + int2str(step);
					if(find(trim_map[funclabel].step_vec.begin(), trim_map[funclabel].step_vec.end(), param_str) != trim_map[funclabel].step_vec.end())
						return param_str;
					else
						return "error";
				}
				else if(trim_map[funclabel].step_vec[0].find("step") != string::npos){
					param_str = param_str + "_step" + int2str(step);
					if(find(trim_map[funclabel].step_vec.begin(), trim_map[funclabel].step_vec.end(), param_str) != trim_map[funclabel].step_vec.end())
						return param_str;
					else
						return "error";
				}
				else 
					return "error";
				//if(step < trim_map[funclabel].step_vec.size())
				//	return trim_map[funclabel].step_vec[step];
				//else
				//	return "error";
			} else
				return "error";
		} else
			return "error";
	} else 
		return "error";

}

string SPEC::get_pre_str(LPCTSTR funclabel){
	if(trim_map.find(funclabel) != trim_map.end()){
		if(trim_map[funclabel].str_pre != "")
			return trim_map[funclabel].str_pre;
		else
			return "error";
	} else 
		return "error";
}

string SPEC::get_pre_bit_str(LPCTSTR funclabel){
	if(trim_map.find(funclabel) != trim_map.end()){
		if(trim_map[funclabel].str_pre_bit != "")
			return trim_map[funclabel].str_pre_bit;
		else
			return "error";
	} else 
		return "error";
}

string SPEC::get_post_str(LPCTSTR funclabel){
	if(trim_map.find(funclabel) != trim_map.end()){
		if(trim_map[funclabel].str_post != "")
			return trim_map[funclabel].str_post;
		else
			return "error";
	} else 
		return "error";
}

string SPEC::get_post_bit_str(LPCTSTR funclabel){
	if(trim_map.find(funclabel) != trim_map.end()){
		if(trim_map[funclabel].str_post_bit != "")
			return trim_map[funclabel].str_post_bit;
		else
			return "error";
	} else 
		return "error";
}

string SPEC::get_target_str(LPCTSTR funclabel){
	if(trim_map.find(funclabel) != trim_map.end()){
		if(trim_map[funclabel].str_target != "")
			return trim_map[funclabel].str_target;
		else
			return "error";
	} else 
		return "error";
}

string SPEC::get_guessed_str(LPCTSTR funclabel){
	if(trim_map.find(funclabel) != trim_map.end()){
		if(trim_map[funclabel].str_guessed != "")
			return trim_map[funclabel].str_guessed;
		else
			return "error";
	} else 
		return "error";
}

string SPEC::get_updated_str(LPCTSTR funclabel){
	if(trim_map.find(funclabel) != trim_map.end()){
		if(trim_map[funclabel].str_updated != "")
			return trim_map[funclabel].str_updated;
		else
			return "error";
	} else 
		return "error";
}

double SPEC::get_low_limit(string param){
	string str;
	double result;

	if(lolim_map.find(param) != lolim_map.end()){
		str = lolim_map[param];
		result = atof(str.c_str());
	} else 
		result = 999999;

	return result;
}

double SPEC::get_high_limit(string param){
	string str;
	double result;

	if(hilim_map.find(param) != hilim_map.end()){
		str = hilim_map[param];
		result = atof(str.c_str());
	} else 
		result = 999999;

	return result;
}


string SPEC::get_unit(string param){

	if(unit_map.find(param) != unit_map.end()){
		return unit_map[param];
	} else 
		return "none";
}

bool SPEC::init(string file){
	map<DWORD, map<DWORD, string>> pgs_map;
	CMapMemFile imap_file;

	if(!imap_file.create(file.c_str())){
		return false;
	}

	path = file;

	imap_file.CsvReader(pgs_map);
	imap_file.CloseMapFile();

	int func_flag = 0;
	string func_str;

	DWORD start = 1;
	DWORD stop = 1;

	for(DWORD row = 1; row < pgs_map.size(); ++row){
		if((pgs_map[row][1].find("FUNCTION") != string::npos) && (func_flag == 0)){
			start = row;
			func_flag = 1;
		}
		if(pgs_map[row][1] == "[Station Setting Block]"){
			stop = row;
			break;
		}
	}

	if(stop <= start)
		return false;

	for(DWORD row = start; row < stop; ++row){
		if(pgs_map[row][1].find("FUNCTION") != string::npos){
			string temp_str(pgs_map[row][1], 11, pgs_map[row][1].length() - 10);
			func_str = temp_str;
		} else {
			string param_str(pgs_map[row][1], 4, pgs_map[row][1].length() - 4);
			param_vec.push_back(param_str);
			func_map[func_str] = param_str;
			lolim_map[param_str] = pgs_map[row][5];
			hilim_map[param_str] = pgs_map[row][6];
			unit_map[param_str] = pgs_map[row][8];

			if((func_str.find("trim") != string::npos) || (func_str.find("Trim") != string::npos)){
				if((pgs_map[row][1].find("Step") != string::npos) || (pgs_map[row][1].find("step") != string::npos))
					trim_map[func_str].step_vec.push_back(param_str);
				if(((pgs_map[row][1].find("Pre") != string::npos) || (pgs_map[row][1].find("pre") != string::npos)) && (pgs_map[row][1].find("bit") == string::npos))
					trim_map[func_str].str_pre = param_str;
				if((pgs_map[row][1].find("Pre_bit") != string::npos) || (pgs_map[row][1].find("pre_bit") != string::npos))
					trim_map[func_str].str_pre_bit = param_str;
				if(((pgs_map[row][1].find("Post") != string::npos) || (pgs_map[row][1].find("post") != string::npos)) && (pgs_map[row][1].find("bit") == string::npos))
					trim_map[func_str].str_post = param_str;
				if((pgs_map[row][1].find("Post_bit") != string::npos) || (pgs_map[row][1].find("post_bit") != string::npos))
					trim_map[func_str].str_post_bit = param_str;
				if((pgs_map[row][1].find("Target") != string::npos) || (pgs_map[row][1].find("target") != string::npos))
					trim_map[func_str].str_target = param_str;
				if((pgs_map[row][1].find("Guessed") != string::npos) || (pgs_map[row][1].find("guessed") != string::npos))
					trim_map[func_str].str_guessed = param_str;
				if((pgs_map[row][1].find("Updated") != string::npos) || (pgs_map[row][1].find("updated") != string::npos))
					trim_map[func_str].str_updated = param_str;
			}
		}
	}


	return true;
}

bool SPEC::print(void){
	//for(map<string, string>::iterator it = func_map.begin(); it != func_map.end(); ++it)
	//	cout << it->first << endl;

	for(vector<string>::iterator it = param_vec.begin(); it != param_vec.end(); ++it){
		cout << *it << "\t" << lolim_map[*it] << "\t" << hilim_map[*it] << "\t" << unit_map[*it] << endl;
	}

	return true;
}

/////////////////goto CFUNC///////////////////////
int CFunc::bstr2int(string str){
	// if not binary data 
	for(size_t i = 0; i < str.length(); ++i)
		if((str[i] != '1') && (str[i] != '0'))
			return 0;

	int result = 0;
	int add = 1;
	for(int i = (int)str.length() - 1; i >= 0; --i){
		if(str[i] == '1'){
			result += add;	
		}
		add *= 2;
	}

	return result;
}


/////////////////goto CBIT///////////////////////

bool CBIT::init(string file){
	map<DWORD, map<DWORD, string>> raw_map;
	CMapMemFile imap_file;

	if(!imap_file.create(file.c_str())){
		return false;
	}

	path = file;

	imap_file.CsvReader(raw_map);
	imap_file.CloseMapFile();

	DWORD start = 1;

	// access bank table
	for(DWORD row = 1; row < raw_map.size(); ++row){
		string bank_str(raw_map[row][1]);
		string param_name;
		if(((bank_str.find("Bank") != string::npos) || (bank_str.find("bank") != string::npos)) && (bank_str[bank_str.length() - 1] >= '0') && (bank_str[bank_str.length() - 1] <= '9')){
			for(DWORD col = 2; col <= 9; ++col){
				if(raw_map[row+1][col] != "")
					param_name = raw_map[row+1][col];
			
				string reg_addr(raw_map[row][col]);
				size_t pos1 = 0;
				size_t pos2 = 0;
				if((reg_addr.find("<") != string::npos) && (reg_addr.find(">") != string::npos)){
					pos1 = reg_addr.find("<");
					pos2 = reg_addr.find(">");
					if(pos2 - pos1 > 1){
						string reg_no(reg_addr, pos1 + 1, pos2 - pos1 - 1);
						reg_addr = reg_no;
					} else 
						return false;
				} else
					return false;

				string param_bit(raw_map[row+2][col]);
				
				addr_map[param_name][atoi(param_bit.c_str())] = atoi(reg_addr.c_str());
			}

			start = row + 2;
		}
	}

	// access trim step table
	CFunc func;
	for(DWORD row = start; row < raw_map.size(); ++row){
		for(DWORD col = 1; col < raw_map[row].size(); ++col){
			if((raw_map[row][col].find("EE") != string::npos) && (raw_map[row][col].find("<") != string::npos)){
				string param_str;
				string default_str;
				string target_str;
				string unit_str;
				string step_str;
				string pcnt_str;
				string val_str;

				param_str = raw_map[row-2][col];
				default_str = raw_map[row-2][col+1];
				target_str = raw_map[row-2][col+2];
				unit_str = raw_map[row][col+2];

				target_map[param_str] = target_str.c_str();
			
				for(DWORD i = row + 1; i < raw_map.size(); ++i){
					if(raw_map[i][col] == "")
						break;
					step_str = raw_map[i][col];
					pcnt_str = raw_map[i][col+1];
					val_str = raw_map[i][col+2];
					int step = func.bstr2int(step_str);
					double pcnt = atof(pcnt_str.c_str());
					double val = atof(val_str.c_str());
					step_map[param_str][step] = val;
					step_pcnt_map[param_str][step] = pcnt;
					default_map[param_str] = func.bstr2int(default_str);
				}
			}
		}
	}


	return true;
}

bool CBIT::print(void){
	//// monitor addr map
	//for(map<string, map<int, int>>::iterator it = addr_map.begin(); it != addr_map.end(); ++it){
	//	for(map<int, int>::iterator it_addr = it->second.begin(); it_addr != it->second.end(); ++it_addr){
	//		cout << it->first << "\t" << it_addr->first << "\t" << it_addr->second << endl;
	//	}
	//}

	//// monitor target map
	//for(map<string, string>::iterator it = target_map.begin(); it != target_map.end(); ++it)
	//	cout << it->first << "\t" << it->second << endl;

	//// monitor default map
	//for(map<string, int>::iterator it = default_map.begin(); it != default_map.end(); ++it)
	//	cout << it->first << "\t" << it->second << endl;

	// monitor step map
	for(map<string, map<int, double>>::iterator it = step_map.begin(); it != step_map.end(); ++it){
		for(map<int, double>::iterator it_step = it->second.begin(); it_step != it->second.end(); ++it_step)
			cout << it->first << "\t" << it_step->first << "\t" << it_step->second << endl;
	}

	// monitor step percnet map
	//for(map<string, map<int, double>>::iterator it = step_pcnt_map.begin(); it != step_pcnt_map.end(); ++it){
	//	for(map<int, double>::iterator it_step = it->second.begin(); it_step != it->second.end(); ++it_step)
	//		cout << it->first << "\t" << it_step->first << "\t" << it_step->second << endl;
	//}

	return true;
}